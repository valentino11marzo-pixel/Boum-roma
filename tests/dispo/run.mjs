// tests/dispo/run.mjs — LE DATE DI DISPONIBILITÀ.
//
// Il difetto di partenza, in produzione dal primo giorno: `availableDate` è
// testo libero, il portal suggeriva "Es: Feb 1, Sep 2026, Immediate" nel
// placeholder, e la vetrina faceva
//
//     const af = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0,10) : day(0);
//
// cioè trasformava in OGGI tutto ciò che non era ISO — i tre esempi del
// placeholder compresi. La card stampava "Available now" su case libere a
// settembre. Qui si verifica che non possa più succedere, e che il messaggio
// unico ("Levico dal 1 settembre, Cavour subito, Pigneto 15/10") non scriva
// mai una data su un immobile che l'operatore non ha nominato.
//
//   node tests/dispo/run.mjs

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const D = require('../../js/dispo-engine.js');

let pass = 0, fail = 0;
const ok = (c, what, extra) => {
  if (c) { pass++; console.log(`  ✓ ${what}`); }
  else { fail++; console.log(`  ✗ ${what}${extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`); }
};

// Ancora fissa: tutte le inferenze d'anno sono relative a questo giorno.
const TODAY = '2026-08-12';

/* ─────────────────────────────────────────────────────────────────────────
   1. LEGGERE UNA DATA
   ───────────────────────────────────────────────────────────────────── */
console.log('\n▸ le stringhe che il catalogo porta davvero');

const P = (s) => D.parseAvailability(s, TODAY);

ok(P('2026-09-01').kind === 'date' && P('2026-09-01').iso === '2026-09-01', 'ISO → data');
ok(P('Subito').kind === 'now', '"Subito" → ora');
ok(P('subito').kind === 'now', 'minuscolo uguale');
ok(P('Immediate').kind === 'now', '"Immediate" (il placeholder del portal) → ora');
ok(P('disponibile ora').kind === 'now', '"disponibile ora" → ora');

// I DUE esempi del placeholder che diventavano "oggi" in vetrina
ok(P('Feb 1').kind === 'date' && P('Feb 1').iso === '2027-02-01',
  '"Feb 1" → 1 febbraio (già passato quest\'anno → il prossimo)', P('Feb 1'));
// "Sep 2026" da SOLO è il campo del portal: una lettura sola, si legge.
ok(P('Sep 2026').iso === '2026-09-01', '"Sep 2026" (il placeholder) → 1 settembre, non "oggi"', P('Sep 2026'));
ok(P('settembre').iso === '2026-09-01', 'un mese che è tutta la stringa si legge');
// …ma DENTRO una frase un mese nudo non è una dichiarazione di data.
ok(P('ristrutturato a maggio, ora si affitta').kind === 'unknown',
  'un mese nudo dentro una frase NON è una data', P('ristrutturato a maggio, ora si affitta'));

ok(P('1 settembre').iso === '2026-09-01', '"1 settembre" → 2026-09-01');
ok(P('dal 1 settembre').iso === '2026-09-01', '"dal 1 settembre"');
ok(P('il 1° settembre 2027').iso === '2027-09-01', 'ordinale e anno esplicito');
ok(P('15/10').iso === '2026-10-15', '"15/10" → giorno prima (convenzione IT)');
ok(P('15-10-2026').iso === '2026-10-15', 'trattini');
ok(P('15.10.26').iso === '2026-10-15', 'anno a due cifre');
ok(P('1 set').iso === '2026-09-01', 'abbreviazione "set"');
ok(P('September 1').iso === '2026-09-01', 'inglese mese-giorno');
ok(P('from September').iso === '2026-09-01', '"from September" → il 1°');
ok(P('libero da ottobre').iso === '2026-10-01', '"da ottobre" → il 1° ottobre');

console.log('\n▸ REGOLA 2 — quando è impreciso si arrotonda TARDI');
ok(P('fine agosto').iso === '2026-08-31', '"fine agosto" → 31, non il 1°', P('fine agosto'));
ok(P('a fine settembre').iso === '2026-09-30', '"a fine settembre" → 30');
ok(P('end of October').iso === '2026-10-31', '"end of October" → 31');
ok(P('metà settembre').iso === '2026-09-15', '"metà settembre" → 15');
ok(P('inizio ottobre').iso === '2026-10-01', '"inizio ottobre" → 1');
// L'invariante che conta: mai una data PRIMA della lettura più piana.
['fine agosto', 'a fine settembre', 'end of October'].forEach((s) => {
  const r = P(s);
  const firstOfMonth = r.iso.slice(0, 8) + '01';
  ok(r.iso > firstOfMonth, `"${s}" non cade mai a inizio mese (mai in vetrina prima del vero)`);
});

console.log('\n▸ REGOLA 1 — ambiguo non diventa MAI "libera ora"');
['', '   ', 'boh', 'da concordare', 'su richiesta', 'quando si libera', 'prossimamente',
  'chiedere in agenzia', 'TBD', 'appena possibile forse'].forEach((s) => {
    const r = P(s);
    ok(r.kind === 'unknown', `"${s || '(vuoto)'}" → unknown (mai now, mai una data)`, r);
  });

console.log('\n▸ le trappole della lingua');
ok(P('may be free later').kind === 'unknown', '"may be free" non diventa maggio');
ok(P('set the price').kind === 'unknown', '"set the price" non diventa settembre');
ok(P('vicino al mare').kind === 'unknown', '"mare" non diventa marzo');
ok(P('32/13').kind === 'unknown', 'una data impossibile è unknown, non un fallback');
ok(P('2026-02-30').kind === 'unknown', '30 febbraio non esiste');
ok(P('29 febbraio 2028').iso === '2028-02-29', 'ma il bisestile vero sì');

/* ─────────────────────────────────────────────────────────────────────────
   2. LO STATO DI UN ANNUNCIO
   ───────────────────────────────────────────────────────────────────── */
console.log('\n▸ resolve(): la precedenza fra i due campi');

ok(D.resolve({ availableFrom: '2026-09-01', availableDate: 'Subito' }, TODAY).iso === '2026-09-01',
  'availableFrom (normalizzato) batte availableDate (storico)');
ok(D.resolve({ availableDate: 'Sep 2026' }, TODAY).iso === '2026-09-01',
  'i 19 annunci esistenti si leggono senza backfill (availableDate storico)');
ok(D.resolve({ availableDate: 'prossimamente' }, TODAY).kind === 'unknown',
  'e il testo davvero illeggibile resta unknown');
ok(D.resolve({ availableFrom: '', availableDate: '2026-10-01' }, TODAY).iso === '2026-10-01',
  'un availableFrom vuoto non nasconde la data storica');
ok(D.resolve({ availableDate: '2026-01-01' }, TODAY).kind === 'now',
  'una data già passata significa "da allora", cioè ora');
ok(D.resolve({}, TODAY).kind === 'unknown', 'nessun campo → unknown');

/* ─────────────────────────────────────────────────────────────────────────
   3. LE PAROLE
   ───────────────────────────────────────────────────────────────────── */
console.log('\n▸ label(): un posto solo, così le pagine non si contraddicono');

ok(/available now/i.test(D.label({ availableDate: 'Subito' }, 'en', TODAY).text), 'EN · ora');
ok(/disponibile ora/i.test(D.label({ availableDate: 'Subito' }, 'it', TODAY).text), 'IT · ora');
ok(/free from/i.test(D.label({ availableFrom: '2026-09-01' }, 'en', TODAY).text), 'EN · dal…');
ok(/libera dal/i.test(D.label({ availableFrom: '2026-09-01' }, 'it', TODAY).text), 'IT · dal…');
ok(D.label({ status: 'waitlist' }, 'en', TODAY).tone === 'waitlist', 'waitlist ha voce propria');

// LA REGRESSIONE COSTOSA, asserita sulle parole finali:
['', 'prossimamente', 'da concordare', 'boh'].forEach((raw) => {
  const t = D.label({ availableDate: raw }, 'en', TODAY);
  ok(t.tone === 'unknown' && !/now/i.test(t.text),
    `una data illeggibile ("${raw || 'vuoto'}") non stampa mai "now"`, t);
});

/* ─────────────────────────────────────────────────────────────────────────
   4. IL MESSAGGIO UNICO
   ───────────────────────────────────────────────────────────────────── */
console.log('\n▸ un messaggio, tutte le date');

// Il catalogo vero (nomi e zone dagli annunci in produzione)
const CAT = [
  { id: 'levico', name: 'Levico', zone: 'Trieste', address: 'Via Appennini 33' },
  { id: 'cavour', name: 'Bilocale Cavour', zone: 'Monti', address: 'Via Cavour 12' },
  { id: 'pigneto', name: 'Pigneto Terrace', zone: 'Pigneto', address: 'Via Ascoli Piceno' },
  { id: 'prati', name: 'Angelico Loft', zone: 'Prati', address: 'Via Angelico 5' },
  { id: 'trastevere', name: 'Bilocale Trastevere', zone: 'Trastevere', address: 'Via in Piscinula' }
];
const B = (t) => D.parseBatch(t, CAT, TODAY);

let r = B('Levico dal 1 settembre, Cavour subito, Pigneto 15/10');
ok(r.ok && r.updates.length === 3, 'tre immobili in un messaggio', r);
ok(r.updates[0].id === 'levico' && r.updates[0].iso === '2026-09-01', '  · Levico → 1 settembre');
ok(r.updates[1].id === 'cavour' && r.updates[1].kind === 'now', '  · Cavour → subito');
ok(r.updates[2].id === 'pigneto' && r.updates[2].iso === '2026-10-15', '  · Pigneto → 15 ottobre');

r = B('Levico 1 settembre\nAngelico subito\nTrastevere fine ottobre');
ok(r.ok && r.updates.length === 3, 'una riga per casa');
ok(r.updates[2].iso === '2026-10-31', '  · "fine ottobre" arrotondato tardi anche qui');

r = B('aggiorna le disponibilità: Levico subito, Prati dal 3 novembre');
ok(r.ok && r.updates.length === 2, 'il preambolo non diventa un immobile', r);

console.log('\n▸ la trasmissione (una data per più case) — solo quando non c\'è altra lettura');
r = B('Levico, Cavour e Pigneto dal 1 settembre');
ok(r.mode === 'broadcast' && r.updates.length === 3, 'una data sola + più case → trasmessa a tutte', r);
ok(r.updates.every(u => u.iso === '2026-09-01'), '  · tutte al 1 settembre');

// LA GUARDIA: messaggio MISTO non trasmette. Se lo facesse, "Pigneto"
// prenderebbe la data di Levico — una data sbagliata su un immobile vero.
r = B('Levico dal 1 settembre, Cavour dal 5 ottobre, Pigneto');
ok(r.mode === 'segments', 'due date esplicite → nessuna trasmissione', r.mode);
ok(r.updates.length === 2, '  · si aggiornano solo le due dichiarate');
ok(r.noDate.length === 1 && r.noDate[0].id === 'pigneto',
  '  · la casa senza data resta indietro E LO DICE (non si indovina)', r.noDate);

console.log('\n▸ ciò che non si fa mai');
r = B('quali sono liberi a settembre?');
ok(!r.ok && r.isQuestion, 'una DOMANDA non diventa mai una scrittura di massa', r);
r = B('quando si libera Levico?');
ok(!r.ok && r.isQuestion, '  · nemmeno se nomina una casa e un verbo di disponibilità');

r = B('il bilocale dal 1 settembre');
ok(!r.ok && r.ambiguous.length === 1, 'due bilocali in catalogo → si chiede quale, non si sceglie', r);

r = B('dal 1 settembre');
ok(!r.ok && r.noListing.length === 1, 'una data senza casa non aggiorna nulla');

r = B('Levico');
ok(!r.ok && r.noDate.length === 1, 'una casa senza data non aggiorna nulla');

r = B('');
ok(!r.ok && r.updates.length === 0, 'messaggio vuoto → niente');

r = B('Levico dal 1 settembre, Levico dal 5 ottobre');
ok(r.updates.length === 1 && r.updates[0].iso === '2026-10-05',
  'stesso immobile due volte → vince l\'ultima parola, non due scritture', r.updates);

r = B('Levico da concordare');
ok(r.ok && r.updates[0].kind === 'unknown',
  '"da concordare" è una DICHIARAZIONE: si scrive unknown, non si ignora il messaggio');

/* ─────────────────────────────────────────────────────────────────────────
   5. COSA FINISCE SU FIRESTORE
   ───────────────────────────────────────────────────────────────────── */
console.log('\n▸ writePatch(): additivo, reversibile, retrocompatibile');

let w = D.writePatch(P('dal 1 settembre'), 'telegram:valentino');
ok(w.availableFrom === '2026-09-01', 'availableFrom normalizzato ISO (il campo che la vetrina legge per primo)');
ok(w.availableDate === '2026-09-01', 'availableDate resta scritto — bot e Pubblicista lo leggono ancora');
ok(w.availableRaw === 'dal 1 settembre', 'le parole dell\'operatore si conservano (come descriptionOriginal)');
ok(w.availableKind === 'date' && !!w.availabilityUpdatedAt, 'stato e timbro');

w = D.writePatch(P('subito'), 'portal');
ok(w.availableFrom === 'Subito' && w.availableKind === 'now', '"Subito" resta la parola che il bot già scrive');
w = D.writePatch(P('boh'), 'portal');
ok(w.availableFrom === '' && w.availableKind === 'unknown', 'unknown svuota i campi invece di inventare una data');

console.log('\n▸ audit(): il quadro d\'insieme');
const a = D.audit([
  { id: 'a', availableDate: 'Subito' },
  { id: 'b', availableFrom: '2026-09-01' },
  { id: 'c', availableDate: 'prossimamente' },
  { id: 'd', status: 'rented' },
  { id: 'e', status: 'waitlist', availableFrom: '2026-12-01' }
], TODAY);
ok(a.total === 5 && a.now === 1 && a.date === 2 && a.unknown === 2, 'conteggio per stato', a);
ok(a.gaps.length === 1 && a.gaps[0].id === 'c',
  'i buchi da colmare escludono gli affittati (non hanno una data da dare)', a.gaps);

/* ─────────────────────────────────────────────────────────────────────────
   6. LE GIUNZIONI — asserite sulla SORGENTE
   ───────────────────────────────────────────────────────────────────── */
console.log('\n▸ le pagine leggono il motore, non una loro regex');

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

['apartments.html', 'apartment-detail.html'].forEach((f) => {
  const s = src(f);
  ok(/dispo-engine\.js/.test(s), `${f} carica il motore`);
  ok(!/\?\s*rawAf\.slice\(0,\s*10\)\s*:\s*day\(0\)/.test(s) && !/:\s*new Date\(\)\.toISOString\(\)\.slice\(0,10\)\s*;/.test(s.split('rawAf')[1] || ''),
    `${f} non ricade più su "oggi" quando la data è illeggibile`);
});

const feed = src('api/feed/immobiliare.js');
ok(/dispo-engine|DISPO/.test(feed), 'il feed Immobiliare conosce la disponibilità');

const state = src('api/publisher/_state.js');
ok(/availableFrom/.test(state), 'il Pubblicista porta la data normalizzata nel contenuto (→ hash → update in coda)');

const api = src('api/listings-availability.js');
ok(/requireCronOrAdmin|x-wizard-secret/i.test(api), 'la porta di scrittura è autenticata');
ok(/parseBatch/.test(api), 'la porta usa lo stesso cervello del bot');

const sign = src('api/magic-sign/submit.js');
ok(/availableFrom/.test(sign) && /endDate/.test(sign),
  'alla firma il listing registra QUANDO torna libero (prima si scriveva solo status:rented)');

const bot = src('bot/boom_listing_wizard.py');
ok(/api\/listings-availability/.test(bot), 'il bot chiama la porta, non scrive Firestore per conto suo');
ok(bot.indexOf("wizard_post, '/api/listings-availability', {'text'") < bot.indexOf("'/api/wizard/interpret'"),
  'e la chiama PRIMA del modello a pagamento (il multi-annuncio costa zero)');

const portal = src('js/portal-app.js');
ok(/BOOM_DISPO\.writePatch/.test(portal), 'anche il portal normalizza col motore invece di scrivere testo libero');
ok(!/placeholder="Es: Feb 1, Sep 2026, Immediate"/.test(portal),
  'il placeholder che suggeriva i formati illeggibili è sparito');

/* ─────────────────────────────────────────────────────────────────────────
   7. LA PORTA, guidata davvero (Firestore finto in memoria)
   ───────────────────────────────────────────────────────────────────── */
console.log('\n▸ /api/listings-availability — il handler vero');

const DB = new Map([
  ['listings/levico', { name: 'Levico', zone: 'Trieste', status: 'available', availableDate: 'Sep 2026' }],
  ['listings/cavour', { name: 'Bilocale Cavour', zone: 'Monti', status: 'available', availableDate: '' }],
  ['listings/vecchia', { name: 'Casa Vecchia', zone: 'Prati', status: 'rented', availableDate: '' }],
]);
const enc = (v) => (v === null || v === undefined) ? { nullValue: null }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
    : typeof v === 'boolean' ? { booleanValue: v }
      : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
        : { stringValue: String(v) };
const dec = (f) => !f ? null : 'nullValue' in f ? null : 'stringValue' in f ? f.stringValue
  : 'integerValue' in f ? Number(f.integerValue) : 'booleanValue' in f ? f.booleanValue
    : 'doubleValue' in f ? f.doubleValue : null;
const toDoc = (p, d) => ({ name: `projects/p/databases/(default)/documents/${p}`, fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, enc(v)])) });

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), body = opts.body ? JSON.parse(opts.body) : null;
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (u.includes(':runQuery')) {
    const coll = body.structuredQuery.from[0].collectionId;
    return json([...DB.entries()].filter(([k]) => k.startsWith(coll + '/')).map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'PATCH') {
    DB.set(path, { ...(DB.get(path) || {}), ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) });
    return json(toDoc(path, DB.get(path)));
  }
  if (opts.method === 'POST') { DB.set(path + '/x', {}); return json(toDoc(path + '/x', {})); }
  return DB.has(path) ? json(toDoc(path, DB.get(path))) : json({ error: { status: 'NOT_FOUND' } }, 404);
};

process.env.WIZARD_SECRET = 'test-secret';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';

const { default: handler } = await import('../../api/listings-availability.js');
// Il handler legge l'orologio VERO (DISPO.todayIso()), non il TODAY pinnato
// delle prove sopra: "1 settembre" senza anno cade nel futuro rispetto a
// oggi, quindi l'anno cambia col calendario. Qui si asserisce che il
// handler PERSISTA l'ISO che il motore produce — l'inferenza dell'anno è
// già provata sopra con la data di riferimento fissa. (Pinnato a
// '2026-09-01', questo blocco è diventato rosso il 2 settembre 2026 senza
// che nessuno avesse toccato nulla.)
const SEPT1 = D.parseAvailability('dal 1 settembre').iso;
const call = async (method, body, headers = { 'x-wizard-secret': 'test-secret' }) => {
  let code = 0, payload = null;
  const res = { status(c) { code = c; return this; }, json(o) { payload = o; return this; }, setHeader() { } };
  await handler({ method, headers, body: body ? JSON.stringify(body) : undefined, on() { }, }, res);
  return { code, payload };
};

let out = await call('GET', null, {});
ok(out.code === 401, 'senza credenziali → 401, nessuna lettura', out.code);

out = await call('GET');
ok(out.code === 200 && out.payload.ok, 'GET col segreto del bot → il quadro');
ok(out.payload.listings[0].kind === 'unknown',
  'la lista di lavoro mette per PRIMI quelli senza data', out.payload.listings.map(l => l.name));

out = await call('POST', { text: 'Levico dal 1 settembre, Cavour subito' });
ok(out.code === 200 && out.payload.dry === true, 'POST {text} senza apply NON scrive: mostra il piano');
ok(DB.get('listings/levico').availableFrom === undefined, '  · e infatti il documento è intatto');

out = await call('POST', { text: 'Levico dal 1 settembre, Cavour subito', apply: true });
ok(out.code === 200 && out.payload.applied.length === 2, 'con apply scrive entrambi', out.payload);
ok(DB.get('listings/levico').availableFrom === SEPT1 && /^\d{4}-09-01$/.test(SEPT1), '  · Levico ha la data ISO');
ok(DB.get('listings/cavour').availableFrom === 'Subito', '  · Cavour è subito');
ok(DB.get('listings/levico').availableRaw === 'Levico dal 1 settembre',
  '  · le parole originali restano sul documento');

out = await call('POST', { text: 'Casa Vecchia dal 1 dicembre', apply: true });
ok(!out.payload.ok, 'un affittato non si aggiorna da un messaggio veloce (non entra nel riconoscimento)');

out = await call('POST', { updates: [{ id: 'levico', iso: 'quando capita' }] });
ok(out.payload.failed.length === 1 && out.payload.failed[0].error === 'unreadable_date',
  'una stringa illeggibile viene RIFIUTATA alla porta, non scritta a caso', out.payload);
ok(DB.get('listings/levico').availableFrom === SEPT1, '  · e il valore buono di prima resta');

out = await call('POST', { updates: [{ id: 'inesistente', iso: '2026-09-01' }] });
ok(out.payload.failed[0].error === 'not_found', 'un id che non esiste non crea un documento');

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} ok, ${fail} ko\n`);
process.exit(fail === 0 ? 0 : 1);
