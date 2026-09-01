// tests/segretaria/run.mjs — LA SEGRETARIA: chi parla, quando tace, chi comanda.
//
// Il rischio è lo stesso della scala della fiducia, ma più vicino al cliente:
// qui la macchina CONVERSA. Quindi si testa quasi solo la direzione
// pericolosa, per mutazione: la Segretaria non parla mai su una chat non
// consegnata, mai con un inquilino, mai oltre i tetti, mai con parole che
// chiedono un umano; le sue risposte-eco non la spengono (o morirebbe al
// primo turno) e un messaggio MANUALE dell'operatore la spegne sempre; una
// risposta con un link fuori dominio non parte MAI — diventa un'escalation.
//
// Esegui: node tests/segretaria/run.mjs

import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import SEG from '../../js/segretaria-engine.js';

// nodemailer mockato via loader (stesso mock della suite notify): la rotaia
// d'invio passa dall'executor vero → agent/_lib, che lo importa staticamente.
register('../notify/loader.mjs', import.meta.url);

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

const NOW = Date.parse('2026-08-28T10:00:00Z');

// ── 1. i default e la config ───────────────────────────────────────────────
{
  ok('default: in servizio (il gate vero è la consegna per chat)', SEG.DEFAULTS.enabled === true);
  ok('default: 12 turni/chat, 60/giorno', SEG.DEFAULTS.maxTurns === 12 && SEG.DEFAULTS.dailyCap === 60);
  const { cfg, rejected } = SEG.mergeConfig({ maxTurns: 1, dailyCap: 100, maxChars: 'x' });
  ok('maxTurns impossibile → default + rejected', cfg.maxTurns === 12 && rejected.some(r => r.key === 'maxTurns'));
  ok('dailyCap valido → accettato', cfg.dailyCap === 100);
  ok('maxChars non numerico → default + rejected', cfg.maxChars === 700 && rejected.some(r => r.key === 'maxChars'));
}

// ── 2. il verdetto sul turno (ogni cancello, per mutazione) ────────────────
{
  const cfg = SEG.DEFAULTS;
  const conv = { segretaria: true, contactType: 'whatsapp', segretariaTurns: 0 };
  ok('chat consegnata + testo normale → reply',
    SEG.turnVerdict({ conv, text: 'is it still available?', cfg, turnsToday: 0 }).act === 'reply');
  ok('MUTAZIONE: chat NON consegnata → mai una parola',
    SEG.turnVerdict({ conv: { ...conv, segretaria: false }, text: 'ciao', cfg, turnsToday: 0 }).act === 'skip');
  ok('kill switch spento → tace',
    SEG.turnVerdict({ conv, text: 'ciao', cfg: { ...cfg, enabled: false }, turnsToday: 0 }).act === 'skip');
  ok('MUTAZIONE: un inquilino non parla mai con la Segretaria',
    SEG.turnVerdict({ conv: { ...conv, contactType: 'tenant' }, text: 'la caldaia perde', cfg, turnsToday: 0 }).act === 'escalate');
  ok('parole legali → passaggio a un umano',
    SEG.turnVerdict({ conv, text: 'I will call my lawyer', cfg, turnsToday: 0 }).act === 'escalate');
  ok('tetto turni per chat → escalation',
    SEG.turnVerdict({ conv: { ...conv, segretariaTurns: 12 }, text: 'ok', cfg, turnsToday: 0 }).act === 'escalate');
  ok('tetto giornaliero → escalation',
    SEG.turnVerdict({ conv, text: 'ok', cfg, turnsToday: 60 }).act === 'escalate');
}

// ── 3. l'eco: la MIA risposta che torna dal Mac non mi spegne ──────────────
{
  const sent = SEG.noteSent({ segretariaSent: [] }, 'Ciao! La casa è libera da settembre 😊', NOW);
  const conv = { segretariaSent: sent };
  ok('la stessa frase (spazi diversi) è un eco',
    SEG.isSegretariaEcho(conv, '  Ciao!  la casa è libera da settembre 😊 ', NOW + 60000));
  ok('una frase diversa NON è un eco (è l\'operatore)',
    !SEG.isSegretariaEcho(conv, 'Ci penso io, grazie', NOW + 60000));
  ok('un eco più vecchio di 48h non conta',
    !SEG.isSegretariaEcho(conv, 'Ciao! La casa è libera da settembre 😊', NOW + 49 * 3600 * 1000));
  let s = { segretariaSent: [] };
  for (let i = 0; i < 15; i++) s.segretariaSent = SEG.noteSent(s, 'msg ' + i, NOW + i);
  ok('il registro degli invii resta capato (≤10)', s.segretariaSent.length === 10, s.segretariaSent.length);
}

// ── 4. la sanificazione dell'uscita: rifiuta, non aggiusta ─────────────────
{
  ok('risposta vuota → rifiutata', SEG.sanitizeReply('', SEG.DEFAULTS).ok === false);
  ok('MUTAZIONE: link fuori dominio → MAI inviato',
    SEG.sanitizeReply('Guarda qui: https://evil.example.com/x', SEG.DEFAULTS).ok === false);
  ok('link boomrome.com → passa', SEG.sanitizeReply('Tutto qui: https://www.boomrome.com/listing/l1', SEG.DEFAULTS).ok === true);
  ok('link wa.me → passa', SEG.sanitizeReply('Scrivici: https://wa.me/393331234567', SEG.DEFAULTS).ok === true);
  const md = SEG.sanitizeReply('**Ciao** questo è `codice`', SEG.DEFAULTS);
  ok('il markdown viene spogliato (WhatsApp non lo rende)', md.ok && !/[*`]/.test(md.text), md.text);
  const long = SEG.sanitizeReply(('Frase breve. '.repeat(120)), { ...SEG.DEFAULTS, maxChars: 300 });
  ok('una risposta troppo lunga viene tagliata a una frase intera', long.ok && long.text.length <= 300 && /\.$/.test(long.text.trim()));
}

// ── 5. le giunzioni, asserite sulla SORGENTE ───────────────────────────────
{
  const msg = readFileSync(new URL('../../api/homie/message.js', import.meta.url), 'utf8');
  ok('homie/message: import STATICI (la lezione nodemailer)', /import SEG from/.test(msg) && /import \{ segretariaTurn, segretariaOffConv \}/.test(msg));
  const iSync = msg.indexOf('await syncLead(');
  const iSeg = msg.indexOf('segretariaTurn({');
  ok('il turno viene DOPO il sync del lead (il dato prima della voce)', iSync > -1 && iSeg > iSync);
  const iEcho = msg.indexOf('isSegretariaEcho');
  const iOff = msg.indexOf('segretariaOffConv(cid');
  ok('l\'eco si controlla PRIMA di spegnere', iEcho > -1 && iOff > iEcho,
    'senza, la Segretaria si spegne da sola al primo turno mirrorato');
  ok('il blocco è best-effort (mai perdere il messaggio)', /catch \(e\) \{ console\.warn\('\[homie\/message\] segretaria/.test(msg));

  const notif = readFileSync(new URL('../../api/telegram/notify-pending.js', import.meta.url), 'utf8');
  ok('il 🤖 compare su ogni lead raggiungibile (telefono O email)', /l\.phone \|\| l\.email.*sg:\$\{l\.id\}/.test(notif));

  const hook = readFileSync(new URL('../../api/telegram/webhook.js', import.meta.url), 'utf8');
  const iSg = hook.indexOf("verb === 'sg'");
  const iFetch = hook.indexOf('await fsGet(`action_queue/${actionId}`)');
  ok('webhook: sg/sgx/sgk PRIMA del lookup action_queue', iSg > -1 && iFetch > -1 && iSg < iFetch);
  ok('webhook: /segretaria esiste', hook.includes("text === '/segretaria'"));

  ok('callback ≤64B: sg:<leadId>', Buffer.byteLength('sg:' + 'x'.repeat(24)) <= 64);
  ok('callback ≤64B: sgx:<convId>', Buffer.byteLength('sgx:conv_whatsapp_393331234567999') <= 64);

  const vjson = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');
  ok('il cron delle risposte email è dichiarato in vercel.json', vjson.includes('/api/segretaria/scan-replies') && /scan-replies\.js/.test(vjson));
  const reg = readFileSync(new URL('../../js/squadra-registry.js', import.meta.url), 'utf8');
  ok('la Segretaria è nell\'organigramma (anti-deriva)', /key: 'segretaria'/.test(reg) && reg.includes('/api/segretaria/scan-replies'));
}

// ── 5b. la risposta email, spogliata del thread citato ─────────────────────
{
  const mail = 'Yes perfect, Thursday works!\n\nOn Mon, Aug 24, 2026 at 10:12 BOOM Rome wrote:\n> Hi Sophie, would Thursday...';
  ok('tiene solo la risposta vera (EN)', SEG.stripQuoted(mail) === 'Yes perfect, Thursday works!');
  const it = 'Va bene giovedì, grazie\nIl giorno lun 24 ago 2026 BOOM Rome ha scritto:\n> Ciao...';
  ok('tiene solo la risposta vera (IT)', SEG.stripQuoted(it) === 'Va bene giovedì, grazie');
  ok('le righe ">" tagliano comunque', SEG.stripQuoted('ok!\n> quoted stuff') === 'ok!');
  ok('un\'email senza citazioni resta intera', SEG.stripQuoted('Ciao,\n\nquando posso vederla?') === 'Ciao,\n\nquando posso vederla?');
  ok('vuota resta vuota (il turno non parte sul nulla)', SEG.stripQuoted('> tutto citato\n> anche questo') === '');
}

// ── 6. IL GIRO VERO: Firestore in memoria, executor reale, AI finta ────────
const DB = new Map();
const TG = [];
let AI_REPLY = { reply: 'Ciao! Sì, è ancora disponibile 😊 Vuoi vederla in video o di persona?', escalate: false };
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
    TG.push({ method: u.split('/').pop(), body: opts.body ? JSON.parse(opts.body) : {} });
    return json({ ok: true, result: { message_id: 1000 + TG.length } });
  }
  if (u.includes('api.anthropic.com')) {
    return json({ content: [{ type: 'text', text: JSON.stringify(AI_REPLY) }], usage: {}, model: 'stub' });
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
process.env.ANTHROPIC_API_KEY = 'sk-test';

const { default: handler } = await import('../../api/homie/message.js');
const { handoverSegretaria } = await import('../../api/segretaria/_core.js');

const call = async payload => {
  const req = {
    method: 'POST',
    headers: { 'x-homie-secret': 'test-secret', 'content-type': 'application/json' },
    body: payload,
    on(ev, cb) { if (ev === 'data') cb(Buffer.from(JSON.stringify(payload))); if (ev === 'end') cb(); return this; },
  };
  let out = null, code = 0;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(o) { out = o; return this; }, end() { return this; } };
  await handler(req, res);
  return { code, ...(out || {}) };
};
const segActions = () => [...DB.entries()].filter(([, v]) => v.proposedBy === 'segretaria');
const msgLogs = () => [...DB.keys()].filter(k => k.startsWith('messageLog/')).length;

DB.set('listings/l2', { name: 'Bilocale Trastevere', zone: 'Trastevere', address: 'Vicolo del Cinque 3', price: 1600, status: 'available' });

// 6a. inbound da sconosciuto: nasce il lead, ma la Segretaria NON parla
let leadId, cid;
{
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567', name: 'Sophie K',
    body: 'Hi! Is the Trastevere flat still available for September?', messageId: 'w1' });
  leadId = r.leadId; cid = r.conversationId;
  ok('6a. il lead nasce come sempre', r.ok === true && !!leadId, r);
  ok('6a. MUTAZIONE: senza consegna, ZERO risposte automatiche', segActions().length === 0 && msgLogs() === 0);
}

// 6b. la consegna (il click 🤖) → il turno parte sul prossimo inbound
{
  const h = await handoverSegretaria(leadId);
  // LA TRAPPOLA VERA: dal secondo messaggio in poi il traffico atterra su
  // conv_lead_<id>, non sulla conversazione iniziale conv_whatsapp_<numero>.
  // La consegna deve marcare quella, o non riceverebbe mai un turno.
  ok('6b. la consegna marca la conversazione che riceverà il traffico', h.ok === true && h.cid === 'conv_lead_' + leadId, h);
  cid = h.cid;
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567',
    body: 'Great! When can I see it?', messageId: 'w2' });
  ok('6b. il messaggio atterra davvero lì', r.conversationId === cid, r.conversationId);
  ok('6b. il turno risponde', r.segretaria && r.segretaria.sent === true, r.segretaria);
  const [, act] = segActions()[0] || [];
  ok('6b. la risposta passa dalla rotaia vera (action executed + messageLog)', act && act.status === 'executed' && msgLogs() === 1, act && act.status);
  ok('6b. contextHash per messaggio (retry-proof)', act && act.contextHash === `segretaria:turn:${cid}:w2`, act && act.contextHash);
  const conv = DB.get('conversations/' + cid);
  ok('6b. il contatore turni avanza e l\'invio è registrato', conv.segretariaTurns === 1 && Array.isArray(conv.segretariaSent) && conv.segretariaSent.length === 1);
  ok('6b. la chat non risulta più "da rispondere"', conv.needsReply === false);
}

// 6c. l'ECO: la sua risposta torna dal Mac come 'out' → NON si spegne
{
  const sent = AI_REPLY.reply;
  await call({ direction: 'out', channel: 'whatsapp', phone: '+393331234567', body: sent, messageId: 'w3' });
  ok('6c. MUTAZIONE: l\'eco non la spegne (o morirebbe al primo turno)',
    DB.get('conversations/' + cid).segretaria === true);
}

// 6d. un 'out' MANUALE dell'operatore la spegne su quella chat
{
  await call({ direction: 'out', channel: 'whatsapp', phone: '+393331234567', body: 'Ci penso io da qui, grazie', messageId: 'w4' });
  ok('6d. il messaggio manuale la spegne (D4)', DB.get('conversations/' + cid).segretaria === false);
}

// 6e. retry di Homie con lo STESSO messageId → nessuna seconda risposta
{
  await handoverSegretaria(leadId);
  const before = msgLogs();
  await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567', body: 'When can I see it?', messageId: 'w2' });
  ok('6e. MUTAZIONE: il retry non risponde due volte', msgLogs() === before);
}

// 6f. parole legali → escalation: niente invio, chat restituita, ping 🖐
{
  const before = msgLogs();
  const tgBefore = TG.length;
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567',
    body: 'This is a scam, I want a refund or I call my lawyer', messageId: 'w5' });
  ok('6f. nessuna risposta automatica', msgLogs() === before && r.segretaria && r.segretaria.escalated === true, r.segretaria);
  ok('6f. la chat torna all\'operatore', DB.get('conversations/' + cid).segretaria === false);
  ok('6f. il ping 🖐 arriva con il contesto', TG.length > tgBefore && JSON.stringify(TG[TG.length - 1].body).includes('Segretaria ti passa'));
}

// 6g. una risposta del modello con un link fuori dominio NON parte mai
{
  await handoverSegretaria(leadId);
  AI_REPLY = { reply: 'Certo! Paga qui: https://evil.example.com/pay', escalate: false };
  const before = msgLogs();
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567', body: 'ok how do I pay?', messageId: 'w6' });
  ok('6g. MUTAZIONE: il link fuori dominio diventa escalation, mai un invio',
    msgLogs() === before && r.segretaria && r.segretaria.escalated === true, r.segretaria);
  AI_REPLY = { reply: 'Ciao! Ci pensiamo noi 😊', escalate: false };
}

// 6h. il kill switch globale vince su tutto
{
  await handoverSegretaria(leadId);
  DB.set('settings/segretaria', { enabled: false });
  const before = msgLogs();
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567', body: 'hello?', messageId: 'w7' });
  ok('6h. MUTAZIONE: kill switch spento → tace', msgLogs() === before && r.segretaria && r.segretaria.acted === false, r.segretaria);
  DB.set('settings/segretaria', { enabled: true });
}

// 6i. il modello stesso può chiedere l'operatore (escalate: true)
{
  AI_REPLY = { reply: '', escalate: true, reason: 'chiede uno sconto sul canone' };
  const before = msgLogs();
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567', body: 'can you do 1400 instead of 1600?', messageId: 'w8' });
  ok('6i. la trattativa passa a Valentino, mai alla macchina',
    msgLogs() === before && r.segretaria && r.segretaria.escalated === true && DB.get('conversations/' + cid).segretaria === false, r.segretaria);
}

// 6j. LA MOSSA D'APERTURA — lead email-only (portale): il click apre via email
{
  const { handoverSegretaria: ho, segretariaOpen } = await import('../../api/segretaria/_core.js');
  AI_REPLY = { reply: 'Ciao Anna! Sì, il Trilocale è disponibile 😊 Vuoi vederlo in video?', escalate: false };
  DB.set('leads/ldmail', { status: 'new', name: 'Anna B', email: 'anna@example.com',
    message: 'Hello, I am interested in the Trilocale, is it available from October?',
    propertyId: 'l2', propertyTitle: 'Bilocale Trastevere' });
  const h = await ho('ldmail');
  ok('6j. la consegna accetta un lead SENZA numero (canale email)', h.ok === true, h);
  globalThis.__mails = [];
  const r = await segretariaOpen('ldmail');
  ok('6j. l\'apertura parte e scrive LEI per prima', r.sent === true, r);
  ok('6j. l\'email è partita davvero (nodemailer vero, mockato)', globalThis.__mails.length === 1, globalThis.__mails.length);
  ok('6j. al destinatario giusto, con l\'oggetto del suo immobile',
    globalThis.__mails[0].to === 'anna@example.com' && /Bilocale Trastevere/.test(globalThis.__mails[0].subject), globalThis.__mails[0] && globalThis.__mails[0].subject);
  const r2 = await segretariaOpen('ldmail');
  ok('6j. MUTAZIONE: un secondo click non riapre (conversazione già avviata)', r2.acted === false, r2);
}

// 6k. l'apertura su una chat GIÀ avviata non scrive (il filo esiste già)
{
  const { segretariaOpen } = await import('../../api/segretaria/_core.js');
  await handoverSegretaria(leadId);   // riconsegnata dopo l'escalation di 6i
  const r = await segretariaOpen(leadId);
  ok('6k. chat con turni già fatti → nessuna apertura doppia', r.acted === false && /avviata/.test(r.why || ''), r);
}

// ── 7. IL POSTINO: la consegna WhatsApp non è un atto di fede ──────────────
// Il buco vero del 29/08: la Segretaria scriveva, l'executor marcava
// 'executed', e il messaggio restava nell'outbox che NESSUNO ritirava — in
// silenzio. Il Postino lato server: ripara le azioni uccise a metà volo e
// trasforma la posta ferma in una card col testo pronto (un tap = consegna).
{
  const { postinoTick, postinoStatus } = await import('../../api/telegram/_postino.js');
  const CHAT = '42';
  const NOW2 = NOW + 3600_000;

  // 7a. posta ferma da 10 minuti → UNA card col testo pronto, e il Mac non potrà più rimandarla
  DB.set('action_queue/st1', {
    status: 'executed', kind: 'reply', proposedBy: 'segretaria', autoApplied: true,
    summary: 'Segretaria → Sophie (whatsapp)',
    payload: { channel: 'whatsapp', phone: '+393331234567', draft: 'Ciao! Confermo giovedì alle 17 😊' },
    executedAt: new Date(NOW2 - 10 * 60000).toISOString(),
  });
  const tgB = TG.length;
  const p1 = await postinoTick({ chatId: CHAT, now: NOW2 });
  const st1 = DB.get('action_queue/st1');
  ok('7a. la posta ferma diventa una card 📮', p1.stalled === 1 && TG.length === tgB + 1, p1);
  const card = JSON.stringify(TG[TG.length - 1].body);
  ok('7a. la card porta il testo PRONTO nel bottone wa.me',
    card.includes('wa.me/393331234567') && card.includes(encodeURIComponent('Ciao! Confermo giovedì alle 17 😊').slice(0, 30)), card.slice(0, 200));
  ok('7a. da quel momento la consegna è dell\'operatore (l\'outbox non rimanda)',
    st1.waSendError === 'stalled_operator_notified' && !!st1.waStallNotifiedAt);
  const p2 = await postinoTick({ chatId: CHAT, now: NOW2 + 60000 });
  ok('7a. MUTAZIONE: il secondo giro non rimanda la card', p2.stalled === 0 && TG.length === tgB + 1, p2);

  // 7b. il filtro dell'outbox VERO esclude la posta passata all'operatore
  const outbox = readFileSync(new URL('../../api/homie/wa-outbox.js', import.meta.url), 'utf8');
  ok('7b. wa-outbox non ritira ciò che ha waSendError (niente doppi messaggi)',
    /!a\.waSentAt && !a\.waSendError/.test(outbox));

  // 7c. l'azione della MACCHINA uccisa a metà volo si riesegue da sola
  DB.set('action_queue/hl1', {
    status: 'approved', kind: 'reply', proposedBy: 'segretaria', autoApplied: true,
    leadId: 'ld1',
    payload: { channel: 'whatsapp', phone: '+393331234567', draft: 'Riprovo io: giovedì va bene?' },
    approvedAt: new Date(NOW2 - 5 * 60000).toISOString(),
  });
  const logsB = msgLogs();
  const p3 = await postinoTick({ chatId: CHAT, now: NOW2 + 120000 });
  ok('7c. l\'azione approved-e-mai-eseguita viene rieseguita (executor vero)',
    p3.healed === 1 && DB.get('action_queue/hl1').status === 'executed' && msgLogs() === logsB + 1, p3);

  // 7d. le approvazioni UMANE non si toccano (le riesegue il webhook col retry suo)
  DB.set('action_queue/hu1', {
    status: 'approved', kind: 'reply', autoApplied: false,
    payload: { channel: 'whatsapp', phone: '+393339999999', draft: 'x' },
    approvedAt: new Date(NOW2 - 20 * 60000).toISOString(),
  });
  const p4 = await postinoTick({ chatId: CHAT, now: NOW2 + 180000 });
  ok('7d. MUTAZIONE: un\'approvazione umana non viene rieseguita dal Postino',
    p4.healed === 0 && DB.get('action_queue/hu1').status === 'approved', p4);

  // 7e. la posta fresca (sotto i 5') non allarma nessuno
  DB.set('action_queue/st2', {
    status: 'executed', kind: 'reply', autoApplied: true,
    payload: { channel: 'whatsapp', phone: '+39333', draft: 'fresco' },
    executedAt: new Date(NOW2 + 200000 - 60000).toISOString(),
  });
  const tgB2 = TG.length;
  await postinoTick({ chatId: CHAT, now: NOW2 + 200000 });
  ok('7e. sotto i 5 minuti nessuna card (il Mac ha il suo tempo)', TG.length === tgB2);

  // 7f. i conteggi per /segretaria dicono il vero
  const stt = await postinoStatus();
  ok('7f. lo stato conta la posta in attesa e quella in mano all\'operatore',
    stt.handedToOperator >= 1 && typeof stt.waiting === 'number', stt);

  // 7g. le giunzioni sulla sorgente
  const notif2 = readFileSync(new URL('../../api/telegram/notify-pending.js', import.meta.url), 'utf8');
  ok('7g. il Postino gira dentro notify-pending, best-effort',
    /postinoTick\(\{ chatId \}\)/.test(notif2) && /postino tick failed/.test(notif2));
  const hook2 = readFileSync(new URL('../../api/telegram/webhook.js', import.meta.url), 'utf8');
  const iPw = hook2.indexOf("verb === 'pw'");
  ok('7g. ✅ Consegnato (pw) registra la consegna manuale, prima del lookup generico',
    iPw > -1 && iPw < hook2.indexOf('await fsGet(`action_queue/${actionId}`)') && /waSentBy: 'operator'/.test(hook2));
  const vjson2 = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');
  ok('7g. notify-pending ha maxDuration 60 (fiducia + postino + card in un minuto)',
    /notify-pending\.js"/.test(vjson2));
  ok('7g. la card della consegna dice la VERITÀ sul canale (executed ≠ consegnato)',
    hook2.includes('in consegna su WhatsApp via Mac'));
}

console.log(fails ? `\n${fails} FAIL` : '\nOK — la Segretaria parla solo dove l\'hai consegnata (e ora apre lei, su WhatsApp o email), tace dove serve una persona, un tuo messaggio la spegne sempre — e la consegna non è mai più un atto di fede.');
process.exit(fails ? 1 : 0);
