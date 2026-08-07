// tests/lock/run.mjs
// IL LUCCHETTO SULL'IMMOBILE — il pezzo che impedisce a due candidati di
// chiudere lo stesso appartamento per lo stesso periodo, pagando entrambi.
//
// Gira le funzioni VERE (compreso fsCreate con create-o-fallisci) su un
// Firestore in memoria che riproduce il comportamento che conta: un POST con
// documentId su un documento esistente risponde 409.
//
//   node tests/lock/run.mjs

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@boom';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';

// ── Firestore finto: solo i tipi e i codici di stato che il lucchetto usa ──
const DB = new Map();
const toF = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toF(x)])) } };
  return { stringValue: String(v) };
};
const fromF = (f) => {
  if (!f || 'nullValue' in f) return null;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('stringValue' in f) return f.stringValue;
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, fromF(x)]));
  return null;
};
const flds = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, toF(v)]));
const unflds = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromF(v)]));
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), m = (opts.method || 'GET').toUpperCase();
  if (u.includes('accounts:signInWithPassword')) return json({ idToken: 'T' });
  if (!u.includes('firestore.googleapis.com')) throw new Error('fetch imprevisto: ' + u);

  const after = decodeURIComponent(u.split('/documents/')[1] || '');
  if (m === 'POST') {
    const coll = after.split('?')[0];
    const dm = u.match(/documentId=([^&]+)/);
    const id = dm ? decodeURIComponent(dm[1]) : 'auto_' + DB.size;
    const path = coll + '/' + id;
    if (DB.has(path)) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);  // ← il compare-and-set
    DB.set(path, unflds(JSON.parse(opts.body || '{}').fields));
    return json({ name: path });
  }
  const path = after.split('?')[0];
  if (m === 'GET') {
    if (!DB.has(path)) return json({ error: { status: 'NOT_FOUND' } }, 404);
    return json({ name: path, fields: flds(DB.get(path)) });
  }
  if (m === 'PATCH') {
    DB.set(path, { ...(DB.get(path) || {}), ...unflds(JSON.parse(opts.body || '{}').fields) });
    return json({ name: path });
  }
  if (m === 'DELETE') { DB.delete(path); return json({}); }
  throw new Error('metodo imprevisto ' + m);
};

const L = await import('../../api/preagreement/_lock.js');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};
const PA = (over = {}) => ({
  propertyId: 'prop_cavour',
  property: { address: 'Via Cavour 12, Roma' },
  lease: { startDate: '2026-09-01', endDate: '2027-08-31', months: 12 },
  tenant: { fullName: 'Anna Rossi' },
  ...over,
});

// ═══ 1 · La chiave dell'immobile ═══════════════════════════════════════════
console.log('\n\x1b[1mSu cosa si blocca\x1b[0m');
check('usa propertyId quando c\'è', L.propertyKey(PA()) === 'p_prop_cavour');
check('scende su listingId', L.propertyKey({ listingId: 'lst9', property: {} }) === 'l_lst9');
const a1 = L.propertyKey({ property: { address: 'Via Cavour 12, Roma' } });
const a2 = L.propertyKey({ property: { address: 'via  cavour, 12 — ROMA' } });
check('l\'indirizzo è l\'ultima rete e normalizza scrittura e accenti', a1 && a1 === a2, `${a1} vs ${a2}`);
check('accenti trattati', L.propertyKey({ property: { address: 'Via Cavòur 12' } }) === L.propertyKey({ property: { address: 'Via Cavour 12' } }));
check('due indirizzi diversi non collidono',
  L.propertyKey({ property: { address: 'Via Cavour 12' } }) !== L.propertyKey({ property: { address: 'Via Giulia 3' } }));
check('senza nulla su cui bloccare → null', L.propertyKey({ property: {} }) === null);

console.log('\n\x1b[1mI mesi della locazione\x1b[0m');
const mm = L.leaseMonths(PA().lease);
check('set 2026 → ago 2027 = 12 bucket', mm.length === 12, String(mm.length));
check('parte dal mese di inizio', mm[0] === '2026-09');
check('arriva al mese di fine incluso', mm[mm.length - 1] === '2027-08', mm[mm.length - 1]);
// Un mese in più nella locazione = un bucket in più: nessun mese scoperto.
check('13 mesi coprono 13 bucket',
  L.leaseMonths({ startDate: '2026-09-01', endDate: '2027-09-30', months: 13 }).length === 13);
check('senza data di inizio → nessun mese', L.leaseMonths({}).length === 0);

// ═══ 2 · Il caso che costa soldi ═══════════════════════════════════════════
console.log('\n\x1b[1mDue candidati sullo stesso appartamento\x1b[0m');
DB.clear();
let anna = await L.acquireLock({ pa: PA(), paId: 'pa_anna' });
check('Anna accetta per prima: prende l\'immobile', anna.ok === true, JSON.stringify(anna));

let marco = await L.acquireLock({ pa: PA({ tenant: { fullName: 'Marco Bianchi' } }), paId: 'pa_marco' });
check('Marco accetta dopo: RESPINTO', marco.ok === false && marco.reason === 'held', JSON.stringify(marco));
check('…e sa da chi è tenuto', marco.by === 'pa_anna' && marco.byRef === 'Anna Rossi');
check('…e fino a quando', typeof marco.until === 'string' && marco.until > new Date().toISOString());
check('il rifiuto non ha lasciato lucchetti orfani di Marco',
  [...DB.values()].every(v => v.paId === 'pa_anna'), JSON.stringify([...DB.values()].map(v => v.paId)));

console.log('\n\x1b[1mRiprovare non è un problema\x1b[0m');
const again = await L.acquireLock({ pa: PA(), paId: 'pa_anna' });
check('Anna che ritocca "accetta" passa (idempotente)', again.ok === true);

// ═══ 3 · Periodi che non si toccano: legittimi ═════════════════════════════
console.log('\n\x1b[1mStesso immobile, periodi diversi\x1b[0m');
DB.clear();
await L.acquireLock({ pa: PA({ lease: { startDate: '2026-09-01', endDate: '2026-12-31', months: 4 } }), paId: 'pa_autunno' });
const inverno = await L.acquireLock({
  pa: PA({ tenant: { fullName: 'Chiara' }, lease: { startDate: '2027-02-01', endDate: '2027-07-31', months: 6 } }),
  paId: 'pa_inverno',
});
check('set–dic e feb–lug convivono: NON bloccato', inverno.ok === true, JSON.stringify(inverno));

const sovrapposto = await L.acquireLock({
  pa: PA({ tenant: { fullName: 'Luca' }, lease: { startDate: '2026-11-01', endDate: '2027-04-30', months: 6 } }),
  paId: 'pa_sovrapposto',
});
check('nov–apr si accavalla su entrambi: bloccato', sovrapposto.ok === false && sovrapposto.reason === 'held');
check('…e dice su quale mese casca', /^\d{4}-\d{2}$/.test(String(sovrapposto.month)), String(sovrapposto.month));

// ═══ 4 · La riserva che non paga non congela l'immobile ════════════════════
console.log('\n\x1b[1mScadenza delle 48 ore\x1b[0m');
DB.clear();
await L.acquireLock({ pa: PA(), paId: 'pa_tiepido' });
// invecchia il lucchetto oltre la finestra
const old = new Date(Date.now() - (L.HOLD_HOURS + 1) * 3600 * 1000).toISOString();
[...DB.keys()].forEach(k => DB.set(k, { ...DB.get(k), heldAt: old }));
const subentro = await L.acquireLock({ pa: PA({ tenant: { fullName: 'Giulia' } }), paId: 'pa_giulia' });
check('chi non ha pagato in 48h perde la presa', subentro.ok === true, JSON.stringify(subentro));
check('l\'immobile è passato a Giulia', [...DB.values()].every(v => v.paId === 'pa_giulia'));

console.log('\n\x1b[1mUn lucchetto confermato non scade mai\x1b[0m');
DB.clear();
await L.acquireLock({ pa: PA(), paId: 'pa_pagante' });
const n = await L.confirmLock({ pa: PA(), paId: 'pa_pagante' });
check('confirmLock marca tutti i mesi', n === L.leaseMonths(PA().lease).length, String(n));
[...DB.keys()].forEach(k => DB.set(k, { ...DB.get(k), heldAt: old }));
const dopoAnni = await L.acquireLock({ pa: PA({ tenant: { fullName: 'Nessuno' } }), paId: 'pa_tardivo' });
check('nemmeno dopo mesi qualcun altro entra', dopoAnni.ok === false && dopoAnni.reason === 'held');
check('lockLive: definitivo resta vivo', L.lockLive({ firm: true, heldAt: old }) === true);
check('lockLive: in attesa e vecchio è morto', L.lockLive({ firm: false, heldAt: old }) === false);

console.log('\n\x1b[1mRevoca: l\'immobile torna libero\x1b[0m');
DB.clear();
await L.acquireLock({ pa: PA(), paId: 'pa_revocato' });
await L.releaseLock({ pa: PA(), paId: 'pa_revocato' });
check('i lucchetti sono spariti', DB.size === 0, String(DB.size));
const riparte = await L.acquireLock({ pa: PA({ tenant: { fullName: 'Nuovo' } }), paId: 'pa_nuovo' });
check('un altro candidato può chiudere', riparte.ok === true);

console.log('\n\x1b[1mNiente su cui bloccare\x1b[0m');
DB.clear();
const nulla = await L.acquireLock({ pa: { property: {}, lease: { startDate: '2026-09-01', months: 12 } }, paId: 'pa_x' });
check('nessun id e nessun indirizzo → unlockable, non un falso ok',
  nulla.ok === false && nulla.reason === 'unlockable', JSON.stringify(nulla));
check('…e non ha scritto lucchetti a caso', DB.size === 0);

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mDue candidati non possono più chiudere lo stesso appartamento.\x1b[0m');
