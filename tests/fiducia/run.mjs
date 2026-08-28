// tests/fiducia/run.mjs — LA SCALA DELLA FIDUCIA: cosa può partire da solo.
//
// Il rischio di questo pezzo è asimmetrico. Se la scala è troppo timida, si
// perde un tap risparmiato; se è troppo audace, un messaggio sbagliato parte
// col nome di BOOM sopra e nessuno l'ha letto. Quindi qui si testa quasi
// solo la direzione pericolosa, per mutazione: ogni cancello (interruttore,
// categoria, mai-promuovibile, campione, tasso, escalation, ✋ Ferma, kill
// switch sulle già armate) deve DIMOSTRARE di fermare l'invio.
//
// E la garanzia di non-regressione più importante di tutte: COI DEFAULT
// (nessun doc settings/fiducia) NON PARTE NIENTE — il deploy non cambia il
// comportamento di produzione finché l'operatore non gira gli interruttori.
//
// Esegui: node tests/fiducia/run.mjs

import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import FID from '../../js/fiducia-engine.js';

// nodemailer mockato via loader (stesso mock della suite notify): l'executor
// vero importa agent/_lib, che lo importa staticamente.
register('../notify/loader.mjs', import.meta.url);

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

const NOW = Date.parse('2026-08-28T10:00:00Z');

// ── 1. i default sono TUTTO SPENTO (pinnati: la non-regressione) ───────────
{
  ok('default: interruttore spento', FID.DEFAULTS.enabled === false);
  ok('default: nessuna categoria promossa', Object.keys(FID.DEFAULTS.categories).length === 0);
  ok('default: grazia 10 minuti', FID.DEFAULTS.graceMin === 10);
  ok('default: campione minimo 30', FID.DEFAULTS.minSample === 30);
  ok('default: tasso minimo 95%', FID.DEFAULTS.minRate === 95);
  const { cfg } = FID.mergeConfig(null);
  ok('config assente = default (niente parte da solo)', cfg.enabled === false && Object.keys(cfg.categories).length === 0);
}

// ── 2. la config: whitelist + rifiuto, mai un aggiustamento silenzioso ─────
{
  const { cfg, rejected } = FID.mergeConfig({
    enabled: true, graceMin: 0, minRate: 101, minSample: '40',
    categories: { 'commerciale:followup': true, 'commerciale:first': true, 'inventata:x': true, 'gestore:payrem': false },
  });
  ok('graceMin impossibile → default + rejected', cfg.graceMin === 10 && rejected.some(r => r.key === 'graceMin'));
  ok('minRate impossibile → default + rejected', cfg.minRate === 95 && rejected.some(r => r.key === 'minRate'));
  ok('minSample numerico in stringa → accettato', cfg.minSample === 40);
  ok('categoria vera accesa → dentro', cfg.categories['commerciale:followup'] === true);
  ok('categoria a false → non dentro', !cfg.categories['gestore:payrem']);
  ok('commerciale:first NON entra nemmeno se scritta a mano', !cfg.categories['commerciale:first']);
  ok('…e il rifiuto ne spiega il perché', rejected.some(r => r.key === 'categories.commerciale:first' && /prima risposta/.test(r.why)));
  ok('categoria inventata → rejected, mai accettata', !cfg.categories['inventata:x'] && rejected.some(r => r.key === 'categories.inventata:x'));
}

// ── 3. la categoria è il prefisso del contextHash, non il kind ─────────────
{
  ok('commerciale:first:<lead>', FID.categoryOf({ contextHash: 'commerciale:first:ld1' }) === 'commerciale:first');
  ok('commerciale:followup:<lead>', FID.categoryOf({ contextHash: 'commerciale:followup:ld1' }) === 'commerciale:followup');
  ok('gestore:payrem:<id>:<week>', FID.categoryOf({ contextHash: 'gestore:payrem:p1:2026-W35' }) === 'gestore:payrem');
  ok('gestore:sign:<id>:<role>:<week>', FID.categoryOf({ contextHash: 'gestore:sign:c1:tenant:2026-W35' }) === 'gestore:sign');
  ok('hash assente → null', FID.categoryOf({}) === null);
  ok('hash monco → null', FID.categoryOf({ contextHash: 'solo' }) === null);
}

// ── 4. le statistiche: status tolleranti, e MAI auto-alimentate ────────────
{
  const hist = [];
  for (let i = 0; i < 20; i++) hist.push({ contextHash: 'commerciale:followup:l' + i, status: 'executed' });
  for (let i = 0; i < 10; i++) hist.push({ contextHash: 'commerciale:followup:m' + i, status: 'approved' });
  hist.push({ contextHash: 'commerciale:followup:r1', status: 'rejected' });
  hist.push({ contextHash: 'commerciale:followup:p1', status: 'pending' });
  // 50 invii AUTOMATICI: se contassero, la scala si promuoverebbe da sola
  for (let i = 0; i < 50; i++) hist.push({ contextHash: 'commerciale:followup:a' + i, status: 'executed', fiduciaAutoSent: true });
  const s = FID.statsFor(hist)['commerciale:followup'];
  ok('il deciso conta approvazioni + rifiuti', s.decided === 31, s);
  ok('il tasso è sul deciso', s.rate === Math.round(100 * 30 / 31), s.rate);
  ok('MUTAZIONE: gli auto-invii NON entrano nel campione', s.decided === 31 && s.approved === 30,
    'se questo fallisce, ogni invio automatico "conferma" la categoria e la scala si autoalimenta');
}

// ── 5. il verdetto: ogni cancello ferma l'invio (per mutazione) ────────────
{
  const goodStats = { 'commerciale:followup': { decided: 40, approved: 39, rejected: 1, rate: 98 } };
  const goodCfg = { enabled: true, graceMin: 10, minSample: 30, minRate: 95, categories: { 'commerciale:followup': true } };
  const action = { contextHash: 'commerciale:followup:ld1', payload: { phone: '+393331234567', draft: 'ciao' } };
  const lead = { status: 'new', message: 'Ciao, cercavo un bilocale a Pigneto per settembre' };

  const base = FID.autoVerdict({ action, lead, stats: goodStats, cfg: goodCfg, now: NOW });
  ok('tutto in regola → auto', base.auto === true, base);
  ok('…con la grazia giusta (now + 10 min)', base.sendAt === NOW + 10 * 60000);
  ok('…e i numeri dichiarati', base.rate === 98 && base.decided === 40);

  const noSwitch = FID.autoVerdict({ action, lead, stats: goodStats, cfg: { ...goodCfg, enabled: false }, now: NOW });
  ok('interruttore spento → MAI auto', noSwitch.auto === false && /interruttore/.test(noSwitch.why), noSwitch);

  const noCat = FID.autoVerdict({ action, lead, stats: goodStats, cfg: { ...goodCfg, categories: {} }, now: NOW });
  ok('categoria non promossa → MAI auto', noCat.auto === false && /non promossa/.test(noCat.why));

  const first = FID.autoVerdict({
    action: { contextHash: 'commerciale:first:ld1', payload: { phone: '+39333', draft: 'x' } },
    lead, stats: { 'commerciale:first': { decided: 500, rate: 100 } },
    cfg: { ...goodCfg, categories: { 'commerciale:first': true } }, now: NOW,
  });
  ok('MUTAZIONE: la prima risposta AI non parte MAI da sola, nemmeno accesa a mano e al 100%',
    first.auto === false && /prima risposta/.test(first.why), first);

  const small = FID.autoVerdict({ action, lead, stats: { 'commerciale:followup': { decided: 29, rate: 100 } }, cfg: goodCfg, now: NOW });
  ok('29 decisioni su 30 richieste → no (campione)', small.auto === false && /campione/.test(small.why));

  const lowRate = FID.autoVerdict({ action, lead, stats: { 'commerciale:followup': { decided: 100, rate: 94 } }, cfg: goodCfg, now: NOW });
  ok('94% contro 95% richiesto → no (tasso)', lowRate.auto === false && /tasso/.test(lowRate.why));

  const angry = FID.autoVerdict({
    action, lead: { status: 'new', message: 'This is a scam, I will contact my lawyer' },
    stats: goodStats, cfg: goodCfg, now: NOW,
  });
  ok('parole legali/rabbia → torna a un umano', angry.auto === false && /umano/.test(angry.why), angry);

  const dead = FID.autoVerdict({ action, lead: { status: 'archived', message: 'ciao' }, stats: goodStats, cfg: goodCfg, now: NOW });
  ok('lead archiviato → no', dead.auto === false && /attivo/.test(dead.why));

  const noRecipient = FID.autoVerdict({
    action: { contextHash: 'commerciale:followup:ld1', payload: { draft: 'ciao' } },
    lead, stats: goodStats, cfg: goodCfg, now: NOW,
  });
  ok('senza recapito → no', noRecipient.auto === false && /recapito/.test(noRecipient.why));
}

// ── 6. le parole che chiedono un umano ─────────────────────────────────────
{
  const act = { payload: { phone: '+39333' } };
  for (const bad of ['parlo col mio avvocato', 'vi faccio una denuncia', 'this is fraud',
                     'I want a refund now', 'è una truffa', 'faccio reclamo al tribunale']) {
    ok(`escalation: ${JSON.stringify(bad)}`, FID.escalationVeto(act, { status: 'new', message: bad }) !== null);
  }
  for (const fine of ['ci vediamo giovedì, grazie!', 'is it still available for September?',
                      'perfetto, a domani', 'quanto è il deposito?']) {
    ok(`normale passa: ${JSON.stringify(fine)}`, FID.escalationVeto(act, { status: 'new', message: fine }) === null);
  }
}

// ── 7. i callback stanno nei 64 byte di Telegram ───────────────────────────
{
  const fsId = 'x'.repeat(24); // gli auto-ID Firestore sono 20 caratteri; margine
  ok('fstop:<id> ≤ 64B', Buffer.byteLength(`fstop:${fsId}`) <= 64);
  ok('ftg:<code> ≤ 64B per ogni categoria', FID.CATEGORIES.every(c => Buffer.byteLength(`ftg:${c.code}`) <= 64));
  ok('i codici categoria sono unici', new Set(FID.CATEGORIES.map(c => c.code)).size === FID.CATEGORIES.length);
}

// ── 8. le giunzioni, asserite sulla SORGENTE ───────────────────────────────
{
  const notif = readFileSync(new URL('../../api/telegram/notify-pending.js', import.meta.url), 'utf8');
  const iTick = notif.indexOf('fiduciaTick(');
  const iLoop = notif.indexOf('const toNotify');
  ok('notify-pending: il tick della fiducia gira PRIMA delle card normali', iTick > -1 && iLoop > -1 && iTick < iLoop,
    'altrimenti la stessa azione riceve due card nello stesso giro');
  ok('notify-pending: il tick è best-effort (un errore non ferma card/lead/visite)', /catch[^}]*fiducia tick failed/.test(notif));

  const fid = readFileSync(new URL('../../api/employees/_fiducia.js', import.meta.url), 'utf8');
  const iDisarm = fid.indexOf('fiduciaDisarmed');
  const iSend = fid.indexOf("approvedBy: 'fiducia-auto'");
  ok('_fiducia: il disarmo (kill switch) viene PRIMA dell\'invio', iDisarm > -1 && iSend > -1 && iDisarm < iSend,
    'spegnere l\'interruttore deve fermare anche le bozze già armate, mai "finire il giro"');
  ok('_fiducia: prima di inviare si RILEGGE il doc fresco e si esige pending',
    /fresh\.status !== 'pending'/.test(fid) && fid.indexOf('fresh.status') < iSend);
  ok('_fiducia: l\'invio passa dallo STESSO executor del tap manuale', /from '..\/agent\/execute.js'/.test(fid));

  const hook = readFileSync(new URL('../../api/telegram/webhook.js', import.meta.url), 'utf8');
  ok('webhook: ✋ Ferma azzera autoSendAt e marca fiduciaStopped',
    /fstop/.test(hook) && /autoSendAt: null/.test(hook) && /fiduciaStopped: true/.test(hook));
  ok('webhook: dopo Ferma restano i tasti Approva/Rifiuta (fermare ≠ rifiutare)',
    hook.indexOf('FERMATA') > -1 && hook.slice(hook.indexOf('FERMATA'), hook.indexOf('FERMATA') + 400).includes('approve:'));
  ok('webhook: /fiducia esiste', hook.includes("text === '/fiducia'"));
  const iFtg = hook.indexOf("verb === 'ftg'");
  const iFetch = hook.indexOf('await fsGet(`action_queue/${actionId}`)');
  ok('webhook: il toggle ftg NON passa dal lookup action_queue', iFtg > -1 && iFetch > -1 && iFtg < iFetch);
}

// ── 9. IL GIRO VERO: Firestore in memoria, executor reale, Telegram finto ──
const DB = new Map();
const TG = [];
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
  if (u.includes('api.telegram.org')) {
    const b = opts.body ? JSON.parse(opts.body) : {};
    TG.push({ method: u.split('/').pop(), body: b });
    return json({ ok: true, result: { message_id: 1000 + TG.length } });
  }
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    const filter = q.where && q.where.fieldFilter;
    const lim = q.limit || 1000;
    const rows = [...DB.entries()]
      .filter(([k]) => k.startsWith(coll + '/'))
      .filter(([, v]) => !filter || String(v[filter.field.fieldPath]) === String(dec(filter.value)))
      .slice(0, lim);
    return json(rows.map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'PATCH') {
    const prev = DB.get(path) || {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    DB.set(path, next);
    return json(toDoc(path, next));
  }
  if (opts.method === 'POST') {
    const qid = u.match(/documentId=([^&]+)/);
    const id = qid ? decodeURIComponent(qid[1]) : 'doc' + (++autoId);
    const key = `${path}/${id}`;
    if (qid && DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(key, DB.get(key)));
  }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

process.env.HOMIE_SECRET = 'test-secret';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.TELEGRAM_BOT_TOKEN = 'tok';
process.env.TELEGRAM_CHAT_ID = '42';

const { fiduciaTick, toggleFiducia } = await import('../../api/employees/_fiducia.js');
const CHAT = '42';
const pendingList = () => [...DB.entries()].filter(([k]) => k.startsWith('action_queue/'))
  .map(([k, v]) => ({ id: k.split('/')[1], ...v })).filter(a => a.status === 'pending');
const msgLogs = () => [...DB.keys()].filter(k => k.startsWith('messageLog/')).length;

// lo storico: 40 follow-up decisi dall'operatore, 39 sì e 1 no (97%)
for (let i = 0; i < 39; i++) DB.set(`action_queue/h${i}`, { contextHash: `commerciale:followup:h${i}`, kind: 'reply', status: 'executed' });
DB.set('action_queue/hr', { contextHash: 'commerciale:followup:hr', kind: 'reply', status: 'rejected' });
DB.set('leads/ld1', { status: 'new', name: 'Sophie', message: 'is it still available for September?' });
DB.set('action_queue/a1', {
  contextHash: 'commerciale:followup:ld1', kind: 'reply', status: 'pending', leadId: 'ld1',
  summary: 'Follow-up a Sophie', payload: { channel: 'whatsapp', phone: '+393331234567', draft: 'Hi Sophie…' },
});

// 9a. COI DEFAULT (nessun settings/fiducia) NON SUCCEDE NIENTE
{
  const out = await fiduciaTick({ pending: pendingList(), chatId: CHAT, now: NOW });
  const a = DB.get('action_queue/a1');
  ok('9a. default: nessuna bozza armata', out.armed === 0 && !a.autoSendAt, out);
  ok('9a. default: nessun invio', out.sent === 0 && msgLogs() === 0);
  ok('9a. default: nessuna card della scala', TG.length === 0);
}

// 9b. acceso l'interruttore e promossa la categoria → si ARMA, non si invia
{
  await toggleFiducia('all');
  await toggleFiducia('cf');
  const out = await fiduciaTick({ pending: pendingList(), chatId: CHAT, now: NOW });
  const a = DB.get('action_queue/a1');
  ok('9b. la bozza si arma (autoSendAt fra 10 minuti)', out.armed === 1 && new Date(a.autoSendAt).getTime() === NOW + 600000, out);
  ok('9b. ma NON parte subito', out.sent === 0 && msgLogs() === 0);
  ok('9b. la card porta il tasto ✋ Ferma', TG.length === 1 && JSON.stringify(TG[0].body).includes('fstop:a1'), TG[0]);
  ok('9b. la card è marcata notificata (niente doppia card)', !!a.telegramNotifiedAt);
}

// 9c. la grazia non è scaduta → giro dopo, ancora niente
{
  const out = await fiduciaTick({ pending: pendingList(), chatId: CHAT, now: NOW + 5 * 60000 });
  ok('9c. a metà grazia non parte', out.sent === 0 && msgLogs() === 0, out);
}

// 9d. ✋ Ferma vince: fermata, la grazia scade e NON parte
{
  DB.set('action_queue/a1', { ...DB.get('action_queue/a1'), autoSendAt: null, fiduciaStopped: true });
  const out = await fiduciaTick({ pending: pendingList(), chatId: CHAT, now: NOW + 20 * 60000 });
  ok('9d. MUTAZIONE: la bozza fermata non parte MAI', out.sent === 0 && msgLogs() === 0 && DB.get('action_queue/a1').status === 'pending', out);
}

// 9e. il kill switch disarma anche una bozza GIÀ armata
{
  DB.set('action_queue/a1', { ...DB.get('action_queue/a1'), autoSendAt: new Date(NOW + 600000).toISOString(), fiduciaStopped: null });
  await toggleFiducia('all'); // spento
  const out = await fiduciaTick({ pending: pendingList(), chatId: CHAT, now: NOW + 2 * 60000 });
  const a = DB.get('action_queue/a1');
  ok('9e. MUTAZIONE: interruttore spento → la bozza armata si DISARMA', out.disarmed === 1 && !a.autoSendAt, out);
  ok('9e. …e non è partita', out.sent === 0 && msgLogs() === 0);
  await toggleFiducia('all'); // riacceso per il seguito
}

// 9f. grazia scaduta → parte DAVVERO, dall'executor vero
{
  DB.set('action_queue/a1', { ...DB.get('action_queue/a1'), autoSendAt: new Date(NOW + 600000).toISOString() });
  const out = await fiduciaTick({ pending: pendingList(), chatId: CHAT, now: NOW + 11 * 60000 });
  const a = DB.get('action_queue/a1');
  ok('9f. la bozza parte a grazia scaduta', out.sent === 1, out);
  ok('9f. l\'executor VERO l\'ha eseguita (status executed)', a.status === 'executed', a.status);
  ok('9f. il messaggio è nel log (stessa strada del tap)', msgLogs() === 1);
  ok('9f. la firma è della scala', a.approvedBy === 'fiducia-auto' && a.fiduciaAutoSent === true);
  ok('9f. il giorno è stampato per il digest', typeof a.fiduciaDay === 'string' && a.fiduciaDay.length === 10, a.fiduciaDay);
}

// 9g. un secondo giro NON rimanda niente (idempotenza)
{
  const before = msgLogs();
  const out = await fiduciaTick({ pending: pendingList(), chatId: CHAT, now: NOW + 12 * 60000 });
  ok('9g. MUTAZIONE: il rerun non duplica l\'invio', out.sent === 0 && msgLogs() === before, out);
}

// 9h. il digest delle 19 esce una volta sola
{
  const day = DB.get('action_queue/a1').fiduciaDay;
  const at19 = Date.parse(day + 'T17:30:00Z'); // 19:30 a Roma d'estate (UTC+2)
  const tgBefore = TG.length;
  await fiduciaTick({ pending: [], chatId: CHAT, now: at19 });
  ok('9h. il digest elenca cosa è partito da solo', TG.length === tgBefore + 1 && JSON.stringify(TG[TG.length - 1].body).includes('da sola'), TG[TG.length - 1]);
  await fiduciaTick({ pending: [], chatId: CHAT, now: at19 + 60000 });
  ok('9h. MUTAZIONE: il secondo giro delle 19 tace (fsCreate 409)', TG.length === tgBefore + 1);
}

// 9i. una prima risposta AI in coda NON viene mai armata, neanche a scala accesa
{
  DB.set('leads/ld2', { status: 'new', name: 'Marco', message: 'info per la casa di Pigneto' });
  DB.set('action_queue/b1', {
    contextHash: 'commerciale:first:ld2', kind: 'reply', status: 'pending', leadId: 'ld2',
    summary: 'Prima risposta a Marco', payload: { channel: 'email', to: 'm@x.it', draft: 'Ciao Marco…' },
  });
  const out = await fiduciaTick({ pending: pendingList(), chatId: CHAT, now: NOW + 30 * 60000 });
  const b = DB.get('action_queue/b1');
  ok('9i. MUTAZIONE: la prima risposta AI resta manuale', out.armed === 0 && !b.autoSendAt && b.status === 'pending', out);
}

console.log(fails ? `\n${fails} FAIL` : '\nOK — la scala della fiducia tiene: parte solo il provato, si ferma con un tap, e coi default non parte niente.');
process.exit(fails ? 1 : 0);
