// tests/miniera/run.mjs — LA MINIERA: lo storico diventa un verdetto onesto.
//
// I due modi in cui questo strumento può tradire l'operatore:
//   · MENTIRE COI NUMERI — una percentuale su 7 thread, un join che manca la
//     persona perché il numero è scritto in un'altra forma, un verdetto
//     "forte" su un campione che non regge (lezione D4 del Perito);
//   · DISTURBARE CHI NON VA DISTURBATO — un inquilino nella lista di
//     re-ingaggio, un cliente che ha già firmato, un lead morto (lezione
//     della ricerca rovesciata: i veti valgono più del punteggio).
// Quindi si testano entrambe le direzioni, sul motore puro E sul handler
// vero (Firestore finto in memoria), con le mutazioni che contano.
//
// Esegui: node tests/miniera/run.mjs

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import MINIERA from '../../js/miniera-engine.js';
import { normalizePhone as leadNormalize, phoneVariants as leadVariants } from '../../api/homie/_lead.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

const NOW = Date.parse('2026-08-10T12:00:00Z');
const days = n => NOW - n * 24 * 3600 * 1000;

// ── 1. parità telefoni col motore dei lead (la lezione già pagata) ─────────
for (const p of ['+393331234567', '3331234567', '00393331234567', '333 123-4567', '06 5551234', '', null, '+4915112345678']) {
  ok(`normalizePhone parità: ${JSON.stringify(p)}`, MINIERA.normalizePhone(p) === leadNormalize(p),
    { engine: MINIERA.normalizePhone(p), lead: leadNormalize(p) });
  ok(`phoneVariants parità: ${JSON.stringify(p)}`,
    JSON.stringify(MINIERA.phoneVariants(p).sort()) === JSON.stringify(leadVariants(p).sort()));
}

// ── 2. la riga alla porta: clip e veti ─────────────────────────────────────
{
  const r = MINIERA.threadRow({
    chatId: '393331234567@s.whatsapp.net', phone: '393331234567', name: 'Sophie',
    msgCount: 10, inCount: 6, outCount: 4,
    firstTs: '2026-06-01T10:00:00Z', lastTs: days(2), firstInTs: days(60),
    firstReplyMinutes: 12.7, lastDirection: 'in',
    firstInText: 'Hello, looking for a flat', lastInText: 'x'.repeat(999), inSample: 'y'.repeat(5000),
  });
  ok('riga valida entra', !!r);
  ok('telefono normalizzato', r.phone === '+393331234567', r.phone);
  ok('testo clippato a 240', r.lastInText.length === 240);
  ok('campione clippato a 1200', r.inSample.length === 1200);
  ok('latenza arrotondata', r.firstReplyMinutes === 13);
  ok('ISO e epoch convivono', r.firstTs === Date.parse('2026-06-01T10:00:00Z'));

  // il JID è internazionale senza "+": tedesco e italiano devono uscire giusti
  ok('JID tedesco → +49…', MINIERA.threadRow({ chatId: '4915112345678@s.whatsapp.net', lastTs: days(1) }).phone === '+4915112345678');
  ok('JID italiano senza phone esplicito → +39…', MINIERA.threadRow({ chatId: '393331234567@s.whatsapp.net', lastTs: days(1) }).phone === '+393331234567');

  ok('un GRUPPO non entra mai', MINIERA.threadRow({ chatId: '12036@g.us', lastTs: days(1) }) === null);
  ok('status broadcast non entra', MINIERA.threadRow({ chatId: 'status@broadcast', lastTs: days(1) }) === null);
  ok('senza chatId non entra', MINIERA.threadRow({ phone: '333', lastTs: days(1) }) === null);
  ok('senza tempo non entra', MINIERA.threadRow({ chatId: 'x@s.whatsapp.net' }) === null);
  ok('hash = msgCount:lastTs', MINIERA.rowHash({ msgCount: 5, lastTs: 123 }) === '5:123');
}

// ── 3. il join aggancia la persona in QUALUNQUE forma del numero ───────────
{
  const index = MINIERA.buildOutcomeIndex({
    leads: [{ phone: '3331234567', status: 'new', grade: 'B', name: 'Sophie' }],   // nazionale
    contracts: [{ tenantPhone: '003934440', signatureStatus: 'partial' }],
    viewings: [{ phone: '+393331234567', status: 'confirmed' }],                    // internazionale
  });
  const o = MINIERA.lookupOutcome(index, '+39 333 123 4567');                       // con spazi
  ok('lead agganciato attraverso le forme', !!o && o.isLead === true);
  ok('la visita si somma sulla stessa persona', o.viewing === true);
}
{ // precedenza dei ruoli: un inquilino resta inquilino anche se è in leads
  const index = MINIERA.buildOutcomeIndex({
    leads: [{ phone: '+393330001111', status: 'new' }],
    users: [{ phone: '3330001111', role: 'tenant' }],
  });
  ok('inquilino batte lead', MINIERA.lookupOutcome(index, '+393330001111').role === 'tenant');
}

// ── 4. il libro dei silenzi: i veti valgono più del punteggio ──────────────
{
  const mk = (chatId, phone, over) => MINIERA.threadRow({
    chatId, phone, name: chatId, msgCount: 6, inCount: 4, outCount: 2,
    firstTs: days(30), lastTs: days(4), firstInTs: days(30), firstReplyMinutes: 20,
    lastDirection: 'out', inSample: 'vorrei visitare il bilocale, 1200 euro ok', ...over,
  });
  const rows = [
    mk('lead-vivo@s', '+393331110001'),                                   // deve entrare
    mk('inquilino@s', '+393331110002'),                                   // MAI (ruolo)
    mk('firmato@s', '+393331110003'),                                     // MAI (contratto)
    mk('morto@s', '+393331110004'),                                       // MAI (lead morto)
    mk('vecchio@s', '+393331110005', { lastTs: days(200), firstTs: days(230) }), // MAI (>120g)
    mk('fresco@s', '+393331110006', { lastTs: NOW - 3600 * 1000 }),       // non ancora (<48h)
    mk('senza-segnale@s', '+393331110007', { inSample: 'ok', inCount: 1 }),// MAI (nessun segnale)
    mk('aspetta@s', '+393331110008', { lastDirection: 'in', lastInText: 'quando posso vederlo?' }), // unanswered
    mk('caldaia@s', '+393331110002', { chatId: 'caldaia@s', lastDirection: 'in', lastInText: 'la caldaia perde' }), // unanswered, ruolo tenant
  ];
  const index = MINIERA.buildOutcomeIndex({
    leads: [
      { phone: '+393331110001', status: 'new' },
      { phone: '+393331110004', status: 'archived' },
      { phone: '+393331110005', status: 'new' },
      { phone: '+393331110006', status: 'new' },
      { phone: '+393331110007', status: 'new' },
      { phone: '+393331110008', status: 'new' },
    ],
    users: [{ phone: '+393331110002', role: 'tenant' }],
    contracts: [{ tenantPhone: '+393331110003', signatureStatus: 'complete' }],
  });
  const joined = MINIERA.joinThreads(rows, index, { now: NOW });
  const book = MINIERA.silenceBook(joined, {});
  const coldIds = book.coldOpen.map(c => c.chatId);
  ok('il lead vivo col segnale entra nel re-ingaggio', coldIds.includes('lead-vivo@s'));
  ok('un INQUILINO non entra MAI nel re-ingaggio', !coldIds.includes('inquilino@s'));
  ok('chi ha FIRMATO non entra MAI', !coldIds.includes('firmato@s'));
  ok('un lead MORTO non entra MAI', !coldIds.includes('morto@s'));
  ok('oltre 120 giorni non si disturba (la ricerca è finita)', !coldIds.includes('vecchio@s'));
  ok('sotto le 48h non è ancora freddo', !coldIds.includes('fresco@s'));
  ok('senza un segnale vero non si riscalda niente', !coldIds.includes('senza-segnale@s'));
  const unIds = book.unanswered.map(u => u.chatId);
  ok('l\'ultima parola del cliente → aspetta risposta', unIds.includes('aspetta@s'));
  ok('anche l\'inquilino della caldaia aspetta (col ruolo in chiaro)',
    !!book.unanswered.find(u => u.chatId === 'caldaia@s' && u.role === 'tenant'));
  ok('i più recenti prima (ancora salvabili)',
    book.unanswered.length < 2 || book.unanswered[0].days <= book.unanswered[book.unanswered.length - 1].days);
}

// ── 5. l'onestà del campione (per mutazione: piccolo → NIENTE percentuali) ─
{
  const mkLead = (i, replyMin, adv) => ({
    row: MINIERA.threadRow({
      chatId: 'c' + i + '@s', phone: '+3933300' + String(10000 + i), msgCount: 4, inCount: 2, outCount: 2,
      firstTs: days(20), lastTs: days(10), firstInTs: days(20),
      firstReplyMinutes: replyMin, lastDirection: 'out', inSample: 'cerco casa a roma zona pigneto',
    }), adv,
  });
  const few = [];
  const leads = [];
  for (let i = 0; i < 5; i++) { const t = mkLead(i, 10, i < 4); few.push(t.row); leads.push({ phone: t.row.phone, status: 'new' }); }
  const idx = MINIERA.buildOutcomeIndex({ leads });
  const stSmall = MINIERA.study(few, idx, { now: NOW });
  ok('campione piccolo → sufficientSample false', stSmall.sufficientSample === false);
  ok('bucket sotto soglia → NESSUN tasso pubblicato',
    stSmall.latency.buckets.every(b => b.rate === null), stSmall.latency.buckets);
  ok('fast/slow sotto soglia → null', stSmall.latency.fast === null && stSmall.latency.slow === null);
  const vdSmall = MINIERA.verdict(stSmall, {});
  ok('il verdetto DICE che il campione non regge', vdSmall.sufficientSample === false && /campione insufficiente/.test(vdSmall.note));
  ok('velocità dichiarata insufficiente, non inventata',
    vdSmall.powers.find(p => p.key === 'velocita').sufficient === false);
}

// ── 6. con un campione VERO i numeri escono, e il verdetto li motiva ───────
{
  const rows = [], leads = [], contracts = [], viewings = [];
  let n = 0;
  const add = (replyMin, outcome, extra = {}) => {
    const phone = '+39333' + String(2000000 + n);
    rows.push(MINIERA.threadRow({
      chatId: 'r' + n + '@s', phone, name: 'P' + n, msgCount: extra.msgCount || 6,
      inCount: extra.inCount != null ? extra.inCount : 3, outCount: 2,
      firstTs: days(40), lastTs: extra.lastTs || days(20), firstInTs: days(40),
      firstReplyMinutes: replyMin, lastDirection: extra.lastDirection || 'out',
      inSample: extra.inSample || 'posso vedere il bilocale? il deposito è alto, 1300 euro',
    }));
    leads.push({ phone, status: 'new' });
    if (outcome === 'viewing') viewings.push({ phone, status: 'confirmed' });
    if (outcome === 'contract') { viewings.push({ phone, status: 'confirmed' }); contracts.push({ tenantPhone: phone, signatureStatus: 'complete', finalizedAt: 'x' }); }
    n++;
  };
  for (let i = 0; i < 20; i++) add(5, i < 12 ? 'viewing' : null);           // veloci: 60% avanzano
  for (let i = 0; i < 20; i++) add(2000, i < 2 ? 'viewing' : null);         // lenti: 10%
  for (let i = 0; i < 8; i++) add(15, 'contract', { msgCount: 15 });        // d'oro
  const idx = MINIERA.buildOutcomeIndex({ leads, contracts, viewings });
  const st = MINIERA.study(rows, idx, { now: NOW, langOf: () => 'it' });
  ok('campione vero → sufficiente', st.sufficientSample === true);
  // i thread d'oro hanno FIRMATO: la precedenza ruoli li ha promossi a
  // tenant, quindi i "lead" del funnel sono 40 e non 48 — comportamento
  // voluto (un inquilino non è più un lead)
  ok('funnel: thread e lead tornano', st.funnel.threads === 48 && st.funnel.joinedLeads === 40 && st.funnel.contract === 8, st.funnel);
  ok('velocità: il divario è misurato', st.latency.fast !== null && st.latency.slow !== null && st.latency.fast > st.latency.slow,
    st.latency);
  ok('thread d\'oro contati (contratto + conversazione vera)', st.goldenCount === 8, st.goldenCount);
  ok('obiezione "deposito" vista', st.objections.deposito >= 40, st.objections);
  const vd = MINIERA.verdict(st, MINIERA.approvalStats([]));
  ok('verdetto sufficiente', vd.sufficientSample === true && vd.note === null);
  const measurable = vd.powers.filter(p => p.measurable !== false);
  ok('i misurabili sono ordinati per punteggio',
    measurable.every((p, i) => i === 0 || !p.sufficient || measurable[i - 1].score >= p.score || !measurable[i - 1].sufficient));
  ok('ogni potere porta i suoi perché coi numeri', measurable.every(p => p.why.length > 0 && /\d/.test(p.why[0])));
  const radar = vd.powers[vd.powers.length - 1];
  ok('radar proprietari: dichiarato non misurabile da qui, mai un punteggio finto',
    radar.key === 'radar-proprietari' && radar.measurable === false && radar.score === null);
  const tg = MINIERA.tgSummary(st, vd);
  ok('recap Telegram: podio presente', /🥇/.test(tg) && /VERDETTO/.test(tg));
}

// ── 7. le approvazioni: materia prima della scala della fiducia ────────────
{
  const acts = [];
  for (let i = 0; i < 12; i++) acts.push({ kind: 'reply', status: i < 11 ? 'executed' : 'rejected' });
  for (let i = 0; i < 3; i++) acts.push({ kind: 'schedule_viewing', status: 'approved' });
  acts.push({ kind: 'reply', status: 'pending' });
  const ap = MINIERA.approvalStats(acts);
  ok('tasso calcolato dove il campione regge', ap.reply.approvalRate === 92, ap.reply);
  ok('sotto campione il tasso NON esce', ap.schedule_viewing.approvalRate === null);
  ok('i pending non contano come decisi', ap.reply.pending === 1);
}

// ── 8. il testo del cliente non rompe il recap (parse_mode HTML) ───────────
{
  const st = MINIERA.study([MINIERA.threadRow({
    chatId: 'x@s', phone: '+393339990000', name: 'Evil <b>', msgCount: 3, inCount: 2, outCount: 1,
    firstTs: days(3), lastTs: days(1), firstInTs: days(3), lastDirection: 'in',
    lastInText: 'ciao <script> & co', inSample: 'ciao <script> & co cercavo casa',
  })], MINIERA.buildOutcomeIndex({ leads: [{ phone: '+393339990000', status: 'new' }] }), { now: NOW });
  const tg = MINIERA.tgSummary(st, MINIERA.verdict(st, {}));
  ok('niente HTML grezzo del cliente nel recap', !/<script>/.test(tg) && /&lt;script&gt;/.test(tg));
}

// ── 9. parità cross-linguaggio con l'estrattore del Mac (se c'è python3) ───
{
  const wacli = [
    { chatId: '393331234567@s.whatsapp.net', fromMe: false, timestamp: 1750000000, body: 'Hello, is the flat available?', pushName: 'Sophie' },
    { chatId: '393331234567@s.whatsapp.net', fromMe: true, timestamp: 1750000600, body: 'Yes! Want a viewing?' },
    { chatId: '393331234567@s.whatsapp.net', fromMe: false, timestamp: 1750001200, body: 'Yes please, Thursday?' },
    { chatId: '12036302@g.us', fromMe: false, timestamp: 1750000000, body: 'group noise' },
  ];
  // La riga che il motore JS si aspetta per quel thread:
  const jsRow = MINIERA.threadRow({
    chatId: '393331234567@s.whatsapp.net', phone: '393331234567', msgCount: 3,
    lastTs: 1750001200 * 1000,
  });
  const knownFile = new URL('./known.tmp.json', import.meta.url);
  const { writeFileSync, rmSync, mkdtempSync } = await import('node:fs');
  const os = await import('node:os');
  writeFileSync(knownFile, JSON.stringify({
    // docId = sha1(chatId)[:40] — ricalcolato qui come fa il server
    [(await import('node:crypto')).createHash('sha1').update('393331234567@s.whatsapp.net').digest('hex').slice(0, 40)]:
      MINIERA.rowHash(jsRow),
  }));
  const script = fileURLToPath(new URL('../../homie-bridge/agent-os/bin/miniera_extract.py', import.meta.url));
  const py = spawnSync('python3', [script, '--known', fileURLToPath(knownFile), '--dry'],
    { input: JSON.stringify(wacli), encoding: 'utf8' });
  if (py.error && py.error.code === 'ENOENT') {
    console.log('NOTE parità python saltata: python3 assente');
  } else {
    const out = (py.stdout || '').trim();
    ok('estrattore: il gruppo non entra, il thread sì', /rows=1\b/.test(out), out);
    ok('estrattore: hash combacia col motore JS → invariato non riparte', /changed=0\b/.test(out), out);

    // --report: il primo sguardo locale esiste, dichiara i propri limiti e
    // recupera il NOME anche quando i messaggi recenti non lo portano.
    // Timestamp FRESCHI: il report usa l'orologio vero e taglia a 120 giorni.
    const nowSec = Math.floor(Date.now() / 1000);
    const wacliFresh = [
      { chatId: '393331234567@s.whatsapp.net', fromMe: false, timestamp: nowSec - 2 * 86400, body: 'Hello, is the flat available?', pushName: 'Sophie' },
      { chatId: '393331234567@s.whatsapp.net', fromMe: true, timestamp: nowSec - 2 * 86400 + 600, body: 'Yes! Want a viewing?' },
      { chatId: '393331234567@s.whatsapp.net', fromMe: false, timestamp: nowSec - 86400, body: 'Yes please, Thursday?' },
    ];
    const rp = spawnSync('python3', [script, '--report'], { input: JSON.stringify(wacliFresh), encoding: 'utf8' });
    const rout = rp.stdout || '';
    ok('report locale: intestazione e silenzi presenti', /primo sguardo LOCALE/.test(rout) && /I SILENZI/.test(rout), rout.slice(0, 200));
    ok('report locale: dichiara che mancano gli esiti', /senza gli esiti/.test(rout));
    ok('report locale: il nome sopravvive all\'ultimo messaggio nostro', /Sophie/.test(rout));
  }
  rmSync(knownFile, { force: true });
}

// ── 10. il handler VERO su un Firestore in memoria ─────────────────────────
const DB = new Map();
const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = f => {
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
const toDoc = (path, data) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });

let autoId = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  if (u.includes('api.telegram.org')) return json({ ok: true });
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    const filter = q.where && q.where.fieldFilter;
    const rows = [...DB.entries()]
      .filter(([k]) => k.startsWith(coll + '/'))
      .filter(([, v]) => !filter || String(v[filter.field.fieldPath]) === String(dec(filter.value)));
    return json(rows.map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'PATCH') {
    const prev = DB.get(path) || {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    DB.set(path, next);
    return json(toDoc(path, next));
  }
  if (opts.method === 'POST') {
    const id = 'doc' + (++autoId);
    DB.set(`${path}/${id}`, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(`${path}/${id}`, DB.get(`${path}/${id}`)));
  }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

process.env.HOMIE_SECRET = 'test-secret';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
delete process.env.TELEGRAM_BOT_TOKEN;

const { default: handler } = await import('../../api/homie/miniera.js');

const call = (method, body, headers = {}) => new Promise(resolve => {
  const req = { method, headers: { 'x-homie-secret': 'test-secret', ...headers }, body };
  const res = {
    _status: 0,
    status(c) { this._status = c; return this; },
    json(o) { resolve({ status: this._status, body: o }); },
  };
  handler(req, res);
});

// auth: senza segreto niente scritture
{
  const before = DB.size;
  const r = await call('POST', { op: 'threads', rows: [{ chatId: 'x@s', lastTs: days(1) }] }, { 'x-homie-secret': 'wrong' });
  ok('segreto sbagliato → 401', r.status === 401);
  ok('…e ZERO scritture', DB.size === before);
}

// sync: idempotente per costruzione
{
  const rows = [
    { chatId: '393332000001@s.whatsapp.net', phone: '393332000001', name: 'Anna', msgCount: 8, inCount: 5, outCount: 3, firstTs: days(30), lastTs: days(3), firstInTs: days(30), firstReplyMinutes: 25, lastDirection: 'in', lastInText: 'posso vederlo domani?', inSample: 'cerco un bilocale a pigneto 1200 euro, posso vederlo domani?' },
    { chatId: 'group@g.us', lastTs: days(1) },                    // veto alla porta
    { chatId: '', lastTs: days(1) },                              // invalida
  ];
  const r1 = await call('POST', { op: 'threads', rows });
  ok('salvate solo le valide', r1.body.saved === 1 && r1.body.invalid === 2, r1.body);
  const count1 = [...DB.keys()].filter(k => k.startsWith('minieraThreads/')).length;
  const r2 = await call('POST', { op: 'threads', rows });
  const count2 = [...DB.keys()].filter(k => k.startsWith('minieraThreads/')).length;
  ok('rimandare TUTTO è un no-op (stesso numero di doc)', count1 === 1 && count2 === 1, { count1, count2 });
  const g = await call('GET');
  ok('GET espone la mappa id→hash per il sync incrementale',
    g.body.ok && Object.values(g.body.known)[0] === '8:' + Number(days(3)), g.body.known);
}

// studio end-to-end: esiti veri dentro, verdetto e rapporto fuori
{
  DB.set('leads/l1', { phone: '3332000001', status: 'new', name: 'Anna' });   // forma nazionale: il join deve reggere
  DB.set('users/u1', { phone: '+393339998888', role: 'tenant' });
  const r = await call('POST', { op: 'study' });
  ok('studio ok', r.status === 200 && r.body.ok === true);
  ok('il thread aggancia il lead scritto in un\'ALTRA forma del numero',
    r.body.study.funnel.joinedLeads === 1, r.body.study.funnel);
  ok('Anna aspetta una risposta → nel libro dei silenzi',
    r.body.study.silence.unanswered.some(u => u.name === 'Anna'));
  ok('il verdetto c\'è e dichiara il campione insufficiente (1 lead)',
    r.body.verdict.sufficientSample === false && /campione insufficiente/.test(r.body.verdict.note));
  const reportKey = [...DB.keys()].find(k => k.startsWith('teamReports/miniera-'));
  ok('rapporto persistito in teamReports', !!reportKey);
  const hb = DB.get('pfsRadarHealth/miniera');
  ok('heartbeat scritto e verde', hb && hb.ok === true && hb.consecutiveErrors === 0, hb);
}

console.log(fails ? `\n${fails} test falliti` : '\nTutti i test passano');
process.exit(fails ? 1 : 0);
