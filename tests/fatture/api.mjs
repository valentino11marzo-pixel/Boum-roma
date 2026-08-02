// tests/fatture/api.mjs — il handler VERO di /api/fiscal/invoices, guidato
// su un Firestore finto in memoria. Nessun mock del modulo: si intercetta
// `fetch`, che è l'unica porta verso Firestore in homie/_lib.js — così gira
// il codice che va in produzione.
//
// Le regole che questa suite tiene ferme sono quelle che, se cedono, non si
// vedono subito e costano care:
//   · reimportare lo stesso CSV non deve MAI duplicare una fattura;
//   · un numero bruciato da una fattura scartata non si riusa mai;
//   · due schede aperte non possono emettere lo stesso numero (il progressivo
//     nasce da una lettura fresca, non dall'elenco che il browser aveva);
//   · una fattura numerata non si cancella (si annulla con nota di credito):
//     un buco nella numerazione non si spiega al controllo.
//
// Uso: node tests/fatture/api.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import E from '../../js/invoice-engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => readFileSync(join(HERE, 'fixtures', n), 'utf8');

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond, detail) => {
  cond ? passed++ : (failed++, bad.push(name));
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''));
};
const near = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) < tol;

// ── Firestore in memoria ──────────────────────────────────────────────
const DB = new Map();
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = (f) => {
  if (!f) return null;
  if ('nullValue' in f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
};
const toDoc = (path, data) => ({
  name: `projects/p/databases/(default)/documents/${path}`,
  fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])),
});
const unfields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dec(v)]));

let autoId = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });

  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents[:/]?([^?:]*)/);
  const path = m ? decodeURIComponent(m[1] || '').replace(/^\//, '') : '';

  if (u.includes(':runQuery')) {
    const coll = body.structuredQuery.from[0].collectionId;
    const rows = [...DB.entries()].filter(([k]) => k.startsWith(coll + '/'));
    return json(rows.map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'DELETE') { DB.delete(path); return json({}); }
  if (opts.method === 'PATCH') {
    // `currentDocument.exists=false` = create-if-missing: se il doc c'è già
    // Firestore rifiuta, e fsPatch ricade sull'update. Riprodurlo qui è
    // necessario, altrimenti il primo PATCH sovrascriverebbe il documento.
    const createOnly = /currentDocument\.exists=false/.test(u);
    if (createOnly && DB.has(path)) return json({ error: 'exists' }, 409);
    DB.set(path, { ...(DB.get(path) || {}), ...unfields(body.fields) });
    return json(toDoc(path, DB.get(path)));
  }
  if (opts.method === 'POST') {
    const docId = (u.match(/[?&]documentId=([^&]+)/) || [])[1];
    const coll = path;
    if (docId) {
      const key = `${coll}/${decodeURIComponent(docId)}`;
      if (DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
      DB.set(key, unfields(body.fields));
      return json(toDoc(key, DB.get(key)));
    }
    const key = `${coll}/doc${++autoId}`;
    DB.set(key, unfields(body.fields));
    return json(toDoc(key, DB.get(key)));
  }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

process.env.CRON_SECRET = 'test-cron';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';

const { default: handler } = await import('../../api/fiscal/invoices.js');

const call = async (payload) => {
  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron' }, body: payload };
  let out = null, code = 0, sent = null;
  const res = {
    setHeader() {}, status(c) { code = c; return this; },
    json(o) { out = o; return this; },
    send(s) { sent = s; return this; },
    end() { return this; },
  };
  await handler(req, res);
  return { code, sent, ...(out || {}) };
};
const invoices = () => [...DB.entries()].filter(([k]) => k.startsWith('invoices/'));

// ═══ 1. Import del registro — idempotente per costruzione ═══
{
  const r1 = await call({ op: 'import', csv: fixture('registro.csv') });
  check('import registro: 46 fatture create', r1.ok && r1.created === 46, r1);
  check('import registro: riconosciuto come "emesse"', r1.kind === 'emesse');

  const r2 = await call({ op: 'import', csv: fixture('registro.csv') });
  check('import registro: reimportare lo stesso file NON duplica',
    r2.created === 0 && r2.skipped === 46, r2);
  check('import registro: il totale in DB resta 46', invoices().length === 46);

  // Id deterministico e leggibile: inv_<anno>_<numero>.
  check('import: id deterministico inv_2026_0023', DB.has('invoices/inv_2026_0023'));
}

// ═══ 2. Import della coda ═══
{
  const r = await call({ op: 'import', csv: fixture('coda.csv') });
  check('import coda: 34 incassi creati', r.ok && r.created === 34 && r.kind === 'da_emettere', r);
  const again = await call({ op: 'import', csv: fixture('coda.csv') });
  check('import coda: reimportare non duplica', again.created === 0 && again.skipped === 34);
  check('import coda: le righe nascono senza numero e senza data fattura',
    [...DB.entries()].filter(([k]) => k.startsWith('invoices/enc_'))
      .every(([, v]) => v.numero == null && v.dataFattura == null));
}

// ═══ 3. state — un solo calcolo per tutte le superfici ═══
let stato;
{
  stato = await call({ op: 'state', anno: 2026 });
  check('state: registro 46 · coda 34', stato.registro.length === 46 && stato.coda.length === 34);
  check('state: IVA Q2 2026 = 2.103,42', near(stato.ledger.byQuarter[2].iva, 2103.42), stato.ledger.byQuarter[2]);
  check('state: coda 30.692,20 lordi con 5.534,59 di IVA latente',
    near(stato.totali.codaLordo, 30692.20) && near(stato.totali.codaIva, 5534.59));
  check('state: prossimo numero libero = 24', stato.numbering.next === 24);
  check('state: allarmi presenti, il più grave primo',
    stato.alerts[0].key === 'da_fatturare' && stato.alerts.some(a => a.key === 'scartate'));
  check('state: il regime IVA è dichiarato NON confermato finché non lo si conferma',
    stato.settings.regimeIva === 'trimestrale' && stato.settings.regimeConfermato === false);
  check('state: il trattamento dei rimborsi spese resta "da decidere" (§4.3)',
    stato.settings.rimborsiSpeseImponibili === null);
  check('state: la risposta non trascina i documenti sorgente',
    stato.registro.every(i => i._raw === undefined));
  check('state: la liquidazione porta gli id, non le fatture intere',
    Array.isArray(stato.ledger.byQuarter[2].ids) && stato.ledger.byQuarter[2].ids.length === 19);
}

// ═══ 4. issue — i progressivi, senza mai riusare un numero bruciato ═══
{
  const primi3 = stato.coda.slice(0, 3).map(i => i.id);
  const r = await call({ op: 'issue', ids: primi3, dataFattura: '2026-09-15' });
  check('issue: tre fatture numerate 24, 25, 26',
    r.ok && r.issued.map(i => i.numero).join(',') === '24,25,26', r);
  check('issue: il numero 22 (scartato) non viene MAI riassegnato',
    !r.issued.some(i => [1, 17, 22].includes(i.numero)));
  check('issue: la proiezione dice trimestre e scadenza',
    r.proiezione.trimestre === 3 && r.proiezione.scadenza === '2026-11-16', r.proiezione);

  // Il progressivo riparte da una lettura fresca: la seconda chiamata non
  // riparte da 24 anche se il chiamante ha in mano lo stato di prima.
  const altre = stato.coda.slice(3, 5).map(i => i.id);
  const r2 = await call({ op: 'issue', ids: altre, dataFattura: '2026-09-15' });
  check('issue: la chiamata successiva continua da 27 (nessuna collisione)',
    r2.issued.map(i => i.numero).join(',') === '27,28', r2);

  // Riemettere una già numerata è un errore esplicito, non un secondo numero.
  const gia = await call({ op: 'issue', ids: [primi3[0]], dataFattura: '2026-09-15' });
  check('issue: una fattura già numerata viene rifiutata con motivo',
    gia.issued.length === 0 && /ha già il numero/.test(gia.errors[0] || ''), gia);

  const bad = await call({ op: 'issue', ids: primi3, dataFattura: 'non-una-data' });
  check('issue: data non valida → 400, niente scritture', bad.code === 400);
}

// ═══ 5. patch — correggere il lordo ricalcola la terna ═══
{
  // Un documento legacy con un solo importo ambiguo.
  DB.set('invoices/legacy1', { number: 'BOOM-2026-0099', amount: 350, status: 'paid', date: '2026-04-02' });
  const before = await call({ op: 'state', anno: 2026 });
  const leg = before.registro.find(i => i.id === 'legacy1');
  check('patch: il legacy arriva marcato needsReview', leg && leg.needsReview === true);

  await call({ op: 'patch', id: 'legacy1', updates: { lordo: 427 } });
  const after = await call({ op: 'state', anno: 2026 });
  const fixed = after.registro.find(i => i.id === 'legacy1');
  check('patch: confermare il lordo ricalcola imponibile e IVA',
    near(fixed.imponibile, 350) && near(fixed.iva, 77), fixed);
  check('patch: e toglie il flag di verifica', fixed.needsReview === false);

  const sdi = await call({ op: 'patch', id: 'legacy1', updates: { statoSdi: 'scartato' } });
  check('patch: lo stato SDI si normalizza (scartato → SCARTATO)', sdi.patch.statoSdi === 'SCARTATO');
  const nope = await call({ op: 'patch', id: 'legacy1', updates: { statoSdi: 'BOH' } });
  check('patch: uno stato SDI inventato è un 400, non un campo libero', nope.code === 400);
  const ignored = await call({ op: 'patch', id: 'legacy1', updates: { imponibile: 1, iva: 1, pippo: 2 } });
  check('patch: imponibile e IVA non sono scrivibili a mano (deriverebbero incoerenti)',
    ignored.code === 400, ignored);
}

// ═══ 6. remove — una fattura numerata non si cancella ═══
{
  const st = await call({ op: 'state', anno: 2026 });
  const codaId = st.coda[0].id;
  const ok1 = await call({ op: 'remove', id: codaId });
  check('remove: una riga di coda mai numerata si può togliere', ok1.ok === true);

  const numerata = 'inv_2026_0021';
  const ko = await call({ op: 'remove', id: numerata });
  check('remove: una fattura numerata viene RIFIUTATA (409)', ko.code === 409, ko);
  check('remove: e resta in banca dati', DB.has('invoices/' + numerata));
  check('remove: il motivo è esplicito (nota di credito)', /nota di credito/.test(ko.error || ''));
}

// ═══ 7. export TIC ═══
{
  const st = await call({ op: 'state', anno: 2026 });
  const attese = st.registro.filter(i => i.anno === 2026).length;
  const r = await call({ op: 'export', scope: 'registro', anno: 2026 });
  const righe = String(r.sent).trim().split('\r\n');
  check('export: intestazione nell\'ordine dei campi TIC',
    righe[0].replace('﻿', '') === E.TIC_COLUMNS.join(';'), righe[0]);
  check('export: una riga per ogni fattura del 2026, intestazione a parte',
    righe.length === attese + 1, { righe: righe.length, attese });
  check('export: importi con la virgola decimale', /;\d+,\d{2};/.test(righe[1]), righe[1]);

  const vuoto = await call({ op: 'export', ids: ['non-esiste'] });
  check('export: nessuna fattura selezionata → 400, non un file vuoto', vuoto.code === 400);
}

// ═══ 8. settings ═══
{
  const r = await call({ op: 'settings', settings: { regimeIva: 'mensile', regimeConfermato: true } });
  check('settings: il regime si può confermare', r.settings.regimeIva === 'mensile' && r.settings.regimeConfermato === true);
  const bad = await call({ op: 'settings', settings: { regimeIva: 'annuale' } });
  check('settings: un regime inesistente viene ignorato', bad.settings.regimeIva === 'mensile');
  await call({ op: 'settings', settings: { regimeIva: 'trimestrale' } });
}

// ═══ 9. auth ═══
{
  let code = 0;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json() { return this; }, send() { return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: {}, body: { op: 'state' } }, res);
  check('auth: senza credenziali è 401', code === 401);
  const unknown = await call({ op: 'inventata' });
  check('op sconosciuta → 400 esplicito', unknown.code === 400);
}

console.log('\n' + (failed ? '❌' : '✅') + ` ${passed} passed, ${failed} failed`);
if (failed) { console.log('Falliti:\n  - ' + bad.join('\n  - ')); process.exit(1); }
