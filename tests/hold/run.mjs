// tests/hold/run.mjs — L'HOLD €300 CHE BLOCCA DAVVERO.
//
// La pagina promette «a refundable €300 takes it off the market for 48
// hours». Queste sono le regole che rendono vera la promessa, guidate
// sulle funzioni VERE (api/ops/_lotto12.js) sopra un Firestore in
// memoria (pattern tests/lock):
//   - la riserva pagata mette la casa in 'reserved' e ricorda da dove
//     veniva (statusBeforeHold);
//   - una casa affittata non si blocca; il primo che paga tiene la presa;
//   - lo spazzino libera SOLO gli hold scaduti — mai una 'reserved'
//     messa a mano dall'operatore (che non ha holdExpiresAt);
//   - il one-shot Lotto 12 è idempotente e non butta mai il testo umano
//     (descriptionOriginal si scrive una volta e resta).
//
//   node tests/hold/run.mjs

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@boom';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.TELEGRAM_BOT_TOKEN = 'tg';
process.env.TELEGRAM_CHAT_ID = '1';

const DB = new Map();
const TG = [];
const toF = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toF(x)])) } };
  return { stringValue: String(v) };
};
const fromF = (f) => {
  if (!f || 'nullValue' in f) return null;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('stringValue' in f) return f.stringValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(fromF);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, fromF(x)]));
  return null;
};
const flds = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, toF(v)]));
const unflds = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromF(v)]));
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), m = (opts.method || 'GET').toUpperCase();
  if (u.includes('accounts:signInWithPassword')) return json({ idToken: 'T' });
  if (u.includes('api.telegram.org')) { TG.push(JSON.parse(opts.body).text); return json({ ok: true }); }
  if (!u.includes('firestore.googleapis.com')) throw new Error('fetch imprevisto: ' + u);

  if (u.includes(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery;
    const coll = q.from[0].collectionId + '/';
    const docs = [...DB.entries()].filter(([p]) => p.startsWith(coll))
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
  throw new Error('metodo imprevisto ' + m);
};

const { placeHold, sweepHolds, runOnceLotto12 } = await import('../../api/ops/_lotto12.js');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${cond || !extra ? '' : ` — ${extra}`}`);
  cond ? pass++ : fail++;
};

// ═══ 1. la presa ═══
console.log('\nLA PRESA');
DB.set('listings/casaA', { name: 'Casa A', status: 'available' });
DB.set('listings/casaB', { name: 'Casa B', status: 'rented' });
{
  const p = await placeHold('casaA', 'res_1');
  const d = DB.get('listings/casaA');
  check('la casa disponibile passa a reserved', d.status === 'reserved');
  check('ricorda da dove veniva', d.statusBeforeHold === 'available');
  check('scadenza ~48h nel futuro',
    new Date(d.holdExpiresAt) - Date.now() > 47 * 3600e3
    && new Date(d.holdExpiresAt) - Date.now() < 49 * 3600e3);
  check('porta il lead della riserva', d.holdLeadId === 'res_1');
  check('esito riportato al chiamante', p && p.status === 'reserved');
}
{
  const p = await placeHold('casaB', 'res_2');
  check('una casa affittata NON si blocca', p === null && DB.get('listings/casaB').status === 'rented');
}
{
  const p = await placeHold('casaA', 'res_3');
  check('il primo che paga tiene la presa', p === null && DB.get('listings/casaA').holdLeadId === 'res_1');
}
{
  const p = await placeHold('', 'res_4');
  check('senza listingId non si tocca niente', p === null);
}

// ═══ 2. lo spazzino ═══
console.log('\nLO SPAZZINO');
DB.set('listings/scaduta', { name: 'Scaduta', status: 'reserved',
  statusBeforeHold: 'waitlist', holdLeadId: 'res_9',
  holdExpiresAt: new Date(Date.now() - 3600e3).toISOString() });
DB.set('listings/manuale', { name: 'Manuale', status: 'reserved' });
{
  const r = await sweepHolds();
  check('libera SOLO l\'hold scaduto', r.liberate === 1 && r.esiti[0] === 'scaduta');
  const d = DB.get('listings/scaduta');
  check('torna allo stato di prima (waitlist)', d.status === 'waitlist');
  check('i campi hold si spengono', !d.holdExpiresAt && !d.holdLeadId && !d.statusBeforeHold);
  check('la reserved MANUALE non si tocca', DB.get('listings/manuale').status === 'reserved');
  check('la casaA (hold vivo) non si tocca', DB.get('listings/casaA').status === 'reserved');
  check('Telegram ricorda il rimborso', TG.length === 1 && /rimborso/i.test(TG[0]) && TG[0].includes('res_9'));
}
{
  const r = await sweepHolds();
  check('un secondo giro è un no-op', r.liberate === 0 && TG.length === 1);
}

// ═══ 3. il one-shot del catalogo ═══
console.log('\nIL ONE-SHOT');
DB.set('listings/OLLVsiKhPrhpT1fx8XmB', { name: 'Bilocale Centro', bedrooms: 3, status: 'waitlist' });
DB.set('listings/Kz9bXztv5QXmQrNhAcoU', { name: 'Ponte Milvio Duplex',
  description: 'Inside a Condo we manage from Years , located in heart' });
DB.set('listings/qRRRV7BjXDPqgTpVchnz', { name: 'Parioli Double Room',
  description: 'Delicious and ultra spacious Bedroom' });
DB.set('listings/2SwJ8yD3ITXylrEtYIlL', { name: 'Pigneto Palace',
  image: 'https://x/IMG_3504.HEIC', images: ['https://x/IMG_3504.HEIC'] });
{
  const r = await runOnceLotto12();
  check('applica al primo giro', r.done === 'applicato' && r.esiti.every(e => e.endsWith(': ok')), JSON.stringify(r));
  check('Bilocale Centro: 1 camera (parola dell\'operatore)',
    DB.get('listings/OLLVsiKhPrhpT1fx8XmB').bedrooms === 1);
  const pm = DB.get('listings/Kz9bXztv5QXmQrNhAcoU');
  check('la descrizione nuova è inglese vero', /duplex on two levels/i.test(pm.description));
  check('il testo umano NON si butta', pm.descriptionOriginal === 'Inside a Condo we manage from Years , located in heart');
  const pg = DB.get('listings/2SwJ8yD3ITXylrEtYIlL');
  check('la cover passa al JPG servito dal sito', /boomrome\.com\/foto-catalogo\/pigneto-palace\.jpg$/.test(pg.image));
  check('la .HEIC resta tracciata (imagesOriginal)', pg.imagesOriginal && pg.imagesOriginal[0].endsWith('.HEIC'));
}
{
  const pm0 = DB.get('listings/Kz9bXztv5QXmQrNhAcoU');
  pm0.description = 'Testo scritto a mano dopo il one-shot';
  const r = await runOnceLotto12();
  check('il secondo giro è un no-op (marker heartbeat)', r.done === 'già applicato');
  check('non riscrive MAI dopo il primo giro',
    DB.get('listings/Kz9bXztv5QXmQrNhAcoU').description === 'Testo scritto a mano dopo il one-shot');
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}HOLD: ${pass} ok, ${fail} falliti\x1b[0m`);
process.exit(fail ? 1 : 0);
