// tests/phone/run.mjs — IL CENTRALINO: la segreteria che risponde solo quando
// l'operatore non può, e trasforma il messaggio in un lead.
//
// I due modi di sbagliare che costano davvero, testati entrambi:
//   · troppo aperto  → un webhook senza chiave firma chiamate false, un
//     inquilino che chiama per la caldaia inquina la pipeline, un retry di
//     Twilio duplica lead e ping;
//   · troppo fragile → Whisper non configurato o l'AI giù NON devono mai
//     perdere la chiamata: il doc esce comunque, con scritto cosa manca.
// Più le regole di lingua (la lezione di leads/scan-inbox: mai un default
// italiano che fa scrivere in italiano a un expat) e la disclosure GDPR nel
// saluto, pinnata: se sparisce dal TwiML, il test la richiede.
//
// Esegui: node tests/phone/run.mjs

import { readFileSync } from 'node:fs';

process.env.HOMIE_SECRET = 'test-secret';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.TWILIO_ACCOUNT_SID = 'AC1';
process.env.TWILIO_AUTH_TOKEN = 'tok';
process.env.OPENAI_API_KEY = 'oa';
process.env.ANTHROPIC_API_KEY = 'an';
process.env.TELEGRAM_BOT_TOKEN = 'tg';
process.env.TELEGRAM_CHAT_ID = '42';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

// ─── 1. le parti pure ──────────────────────────────────────────────────────
const {
  phoneKey, twimlGreeting, twimlThanks, xmlEscape,
  sanitizeAnalysis, fallbackAnalysis, fallbackDraft,
  GREETING_IT, GREETING_EN,
} = await import('../../api/phone/_lib.js');

const KEY = phoneKey('test-secret');
ok('chiave derivata: stabile', KEY === phoneKey('test-secret'));
ok('chiave derivata: non è il secret', KEY !== 'test-secret' && KEY.length === 40);
ok('chiave derivata: secret diverso → chiave diversa', phoneKey('altro') !== KEY);
ok('senza secret → null (mai una chiave di comodo)', phoneKey('') === null);

// La disclosure è la porta: assistente automatico + registrazione, in ENTRAMBE le lingue.
ok('saluto IT dichiara l\'assistente automatico', /assistente automatico/i.test(GREETING_IT));
ok('saluto IT dichiara la registrazione', /registrat/i.test(GREETING_IT));
ok('saluto EN dichiara l\'assistente', /automated assistant/i.test(GREETING_EN));
ok('saluto EN dichiara la registrazione', /recorded/i.test(GREETING_EN));

{
  const t = twimlGreeting({ base: 'https://boomrome.com', key: KEY });
  ok('TwiML: Record presente', /<Record /.test(t));
  ok('TwiML: callback registrazione → /api/phone/recording con chiave', t.includes(xmlEscape(`https://boomrome.com/api/phone/recording?k=${KEY}`)));
  ok('TwiML: action → stage=done', t.includes('stage=done'));
  ok('TwiML: saluto in entrambe le lingue', t.includes('it-IT') && t.includes('en-GB'));
  ok('TwiML thanks: riaggancia', /<Hangup\/>/.test(twimlThanks()));
  ok('xmlEscape: niente & nudi', !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(t));
}

// La lingua la decidono le PAROLE, non la dichiarazione del modello.
{
  const en = sanitizeAnalysis({ language: 'it', draftReply: '' }, 'Hello, I am calling about the flat in Trastevere, is it still available?');
  ok('trascrizione inglese batte la dichiarazione "it"', en.language === 'en', en.language);
  ok('…e la bozza fallback è inglese', en.draftReply === fallbackDraft('en'));
  const it = sanitizeAnalysis({ language: 'en' }, 'Buongiorno, vorrei visitare l\'appartamento, sono disponibile giovedì');
  ok('trascrizione italiana batte la dichiarazione "en"', it.language === 'it', it.language);
  const short = sanitizeAnalysis({ language: 'it' }, 'ok');
  ok('testo troppo corto → vale la dichiarazione', short.language === 'it');
  const none = sanitizeAnalysis({}, '');
  ok('niente testo, niente dichiarazione → inglese (lingua di casa)', none.language === 'en');
}

// Whitelist: un enum inventato non passa mai.
{
  const s = sanitizeAnalysis({ intent: 'compra-casa', suggestedAction: 'invia-bonifico', urgency: 'panic', summary: 'x'.repeat(999) }, 'Buongiorno, cercavo un bilocale a Roma per favore');
  ok('intent fuori enum → altro', s.intent === 'altro');
  ok('azione fuori enum → richiama', s.suggestedAction === 'richiama');
  ok('urgenza fuori enum → medium', s.urgency === 'medium');
  ok('riassunto clippato', s.summary.length <= 400);
  const f = fallbackAnalysis('Hi, calling about the apartment');
  ok('fallback senza AI: riassunto = parole vere', f.summary.startsWith('Hi, calling'));
  ok('fallback senza trascrizione: dice che manca, non tace', fallbackAnalysis('').summary.includes('nessuna trascrizione'));
}

// ─── 2. il Firestore in memoria (stessa disciplina di tests/whatsapp) ──────
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
const toDoc = (path, data) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });

let autoId = 0;
let tgCalls = 0;
let tgDown = false;
let whisperText = 'Buongiorno, sono Marco, cercavo un bilocale a Trastevere, potete richiamarmi?';
let aiJson = null;   // null → 500 dal provider
let aiHits = 0;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({
    ok: status < 400, status,
    json: async () => o, text: async () => JSON.stringify(o),
    arrayBuffer: async () => new Uint8Array([73, 68, 51, 4]).buffer,   // "ID3…"
  });

  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  if (u.includes('api.telegram.org')) {
    if (tgDown) return json({ ok: false, description: 'down' }, 500);
    tgCalls++;
    return json({ ok: true, result: { message_id: tgCalls } });
  }
  if (u.includes('api.twilio.com') && u.includes('/Recordings/')) return json({});
  if (u.includes('api.twilio.com') && u.includes('/Calls/')) return json({ from: '+39 339 9999999' });
  if (u.includes('firebasestorage.googleapis.com')) return json({ downloadTokens: 'dl-tok-1' });
  if (u.includes('api.openai.com')) {
    if (!whisperText) return json({ error: 'no' }, 500);
    return json({ text: whisperText });
  }
  if (u.includes('api.anthropic.com')) {
    aiHits++;
    if (!aiJson) return json({ error: 'down' }, 500);
    return json({ content: [{ type: 'text', text: JSON.stringify(aiJson) }] });
  }

  // ── Firestore REST ──
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
    // come il Firestore vero: currentDocument.exists=false su un doc esistente → 400
    if (u.includes('currentDocument.exists%3Dfalse') || u.includes('currentDocument.exists=false')) {
      if (DB.has(path)) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
    }
    const prev = DB.get(path) || {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    DB.set(path, next);
    return json(toDoc(path, next));
  }
  if (opts.method === 'POST') {
    const qm = u.match(/documentId=([^&]+)/);
    const id = qm ? decodeURIComponent(qm[1]) : 'doc' + (++autoId);
    const key = `${path}/${id}`;
    if (qm && DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(key, DB.get(key)));
  }
  if (opts.method === 'DELETE') { DB.delete(path); return json({}); }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

const { default: inbound } = await import('../../api/phone/inbound.js');
const { default: recording } = await import('../../api/phone/recording.js');

const call = async (handler, { method = 'POST', query = {}, body = {}, headers = {} } = {}) => {
  const qs = new URLSearchParams(query).toString();
  const req = {
    method, query, headers, body,
    url: '/api/phone/x' + (qs ? '?' + qs : ''),
    on(ev, cb) { if (ev === 'data') cb(Buffer.from(new URLSearchParams(body).toString())); if (ev === 'end') cb(); return this; },
  };
  let out = null, code = 0, sent = null; const hdrs = {};
  const res = {
    setHeader(k, v) { hdrs[k.toLowerCase()] = v; },
    status(c) { code = c; return this; },
    json(o) { out = o; return this; },
    end(b) { sent = b; return this; },
  };
  await handler(req, res);
  return { code, out, sent, hdrs };
};
const leads = () => [...DB.entries()].filter(([k]) => k.startsWith('leads/'));

// il catalogo che matchListing legge
DB.set('listings/l1', { id: 'l1', name: 'Trilocale Pigneto', zone: 'Pigneto', price: 1400 });
DB.set('listings/l2', { id: 'l2', name: 'Bilocale Trastevere', zone: 'Trastevere', price: 1600 });

// ─── 3. la porta: mai senza chiave ─────────────────────────────────────────
{
  const r = await call(inbound, { query: {} });
  ok('inbound senza chiave → 401', r.code === 401 && !r.sent, r.code);
  const r2 = await call(recording, { body: { CallSid: 'CAx' } });
  ok('recording senza chiave → 401, zero scritture', r2.code === 401 && !DB.has('phoneCalls/CAx'), r2.code);
  const r3 = await call(inbound, { method: 'GET', query: { setup: '1' } });
  ok('setup senza auth admin → 401 (la chiave non si regala)', r3.code === 401, r3.code);
}

// ─── 4. la chiamata entra: TwiML + doc ─────────────────────────────────────
{
  const r = await call(inbound, {
    query: { k: KEY },
    headers: { host: 'boomrome.com' },
    body: { CallSid: 'CA1', From: '+39 333 1234567', To: '+390612345678' },
  });
  ok('inbound → 200 TwiML', r.code === 200 && String(r.hdrs['content-type']).includes('text/xml'), r);
  ok('…con Record e callback firmato', /<Record /.test(r.sent) && r.sent.includes(`/api/phone/recording?k=${KEY}`));
  const doc = DB.get('phoneCalls/CA1');
  ok('il doc nasce SUBITO (anche chi riaggancia resta visibile)', !!doc && doc.status === 'in-progress', doc);
  ok('…col numero normalizzato', doc.from === '+393331234567', doc.from);

  const again = await call(inbound, { query: { k: KEY }, headers: { host: 'boomrome.com' }, body: { CallSid: 'CA1', From: '+393331234567' } });
  ok('retry di Twilio sull\'inbound → stesso doc, TwiML comunque', again.code === 200 && DB.get('phoneCalls/CA1').status === 'in-progress');

  const done = await call(inbound, { query: { k: KEY, stage: 'done' }, body: {} });
  ok('stage=done → grazie e riaggancia', done.code === 200 && /<Hangup\/>/.test(done.sent));
}

// ─── 5. il messaggio diventa lead (sconosciuto vero) ───────────────────────
{
  aiJson = {
    callerName: 'Marco', language: 'it',
    summary: 'Marco cerca un bilocale a Trastevere e chiede di essere richiamato.',
    intent: 'nuova-richiesta', urgency: 'medium', suggestedAction: 'whatsapp',
    draftReply: 'Ciao Marco! Ho sentito il tuo messaggio — il bilocale a Trastevere è disponibile. Ti va una visita? Valentino · BOOM',
  };
  const r = await call(recording, {
    query: { k: KEY },
    body: { CallSid: 'CA1', RecordingSid: 'RE1', RecordingStatus: 'completed', RecordingDuration: '23', RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1' },
  });
  ok('recording → 200 received', r.code === 200 && r.out.status === 'received', r.out);
  const doc = DB.get('phoneCalls/CA1');
  ok('audio in casa BOOM con URL tokenizzato', String(doc.audioUrl).includes('phone-calls%2FCA1.mp3') && String(doc.audioUrl).includes('token=dl-tok-1'), doc.audioUrl);
  ok('trascrizione sul doc', doc.transcript === whisperText && doc.transcriptStatus === 'ok');
  ok('riassunto e azione consigliata', doc.summary.includes('Marco') && doc.suggestedAction === 'whatsapp');
  ok('la casa riconosciuta dalle parole', doc.propertyId === 'l2', doc.propertyId);
  ok('lingua del chiamante: italiano vero', doc.language === 'it');
  ok('sconosciuto → lead creato', r.out.leadCreated === true && leads().length === 1, r.out);
  const [, lead] = leads()[0];
  ok('lead: source phone, schema condiviso', lead.source === 'phone' && lead.status === 'new' && lead.phone === '+393331234567', lead);
  ok('lead: il messaggio sono le parole vere', lead.message === whisperText);
  ok('lead: la casa viaggia col lead', lead.propertyId === 'l2');
  ok('lead: la lingua NON si dichiara (la deduce replyLang)', lead.language === null);
  ok('ping Telegram partito una volta', tgCalls === 1, tgCalls);
  ok('processedAt stampato (idempotenza armata)', !!doc.processedAt);
}

// ─── 6. il retry di Twilio non duplica niente ──────────────────────────────
{
  const before = { leads: leads().length, tg: tgCalls };
  const r = await call(recording, {
    query: { k: KEY },
    body: { CallSid: 'CA1', RecordingSid: 'RE1', RecordingStatus: 'completed', RecordingDuration: '23', RecordingUrl: 'https://api.twilio.com/x/Recordings/RE1' },
  });
  ok('secondo callback → duplicate, zero doppioni', r.out.duplicate === true && leads().length === before.leads && tgCalls === before.tg, r.out);
}

// ─── 7. un inquilino che chiama non è un lead ──────────────────────────────
{
  DB.set('users/u1', { id: 'u1', role: 'tenant', name: 'Anna Bianchi', phone: '3387654321' });   // nazionale in archivio
  await call(inbound, { query: { k: KEY }, headers: { host: 'boomrome.com' }, body: { CallSid: 'CA2', From: '+393387654321' } }); // internazionale dal caller ID
  whisperText = 'Ciao, sono Anna, la caldaia non funziona, potete mandare qualcuno per favore?';
  aiJson = { language: 'it', summary: 'Anna (inquilina) segnala la caldaia rotta.', intent: 'inquilino', urgency: 'high', suggestedAction: 'manutenzione', draftReply: 'Ciao Anna! Mando subito qualcuno. Valentino · BOOM' };
  const before = leads().length;
  const r = await call(recording, { query: { k: KEY }, body: { CallSid: 'CA2', RecordingStatus: 'completed', RecordingDuration: '15', RecordingUrl: 'https://api.twilio.com/x/Recordings/RE2' } });
  ok('inquilino riconosciuto in OGNI forma del numero', DB.get('phoneCalls/CA2').callerType === 'tenant');
  ok('…col suo nome, non un numero', DB.get('phoneCalls/CA2').callerName === 'Anna Bianchi');
  ok('…e NESSUN lead in pipeline', leads().length === before && !r.out.leadId, r.out);
}

// ─── 8. riagganciato prima del bip: resta il fatto, non nasce niente ───────
{
  await call(inbound, { query: { k: KEY }, headers: { host: 'boomrome.com' }, body: { CallSid: 'CA3', From: '+393350000001' } });
  const before = { leads: leads().length, tg: tgCalls };
  const r = await call(recording, { query: { k: KEY }, body: { CallSid: 'CA3', RecordingStatus: 'absent' } });
  ok('absent → no-message, niente lead, niente ping', r.out.status === 'no-message' && DB.get('phoneCalls/CA3').status === 'no-message' && leads().length === before.leads && tgCalls === before.tg, r.out);
}

// ─── 9. Whisper non configurato: la chiamata NON si perde ──────────────────
{
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  await call(inbound, { query: { k: KEY }, headers: { host: 'boomrome.com' }, body: { CallSid: 'CA4', From: '+393350000002' } });
  aiJson = null;   // anche l'AI giù: doppio guasto
  const r = await call(recording, { query: { k: KEY }, body: { CallSid: 'CA4', RecordingStatus: 'completed', RecordingDuration: '31', RecordingUrl: 'https://api.twilio.com/x/Recordings/RE4' } });
  const doc = DB.get('phoneCalls/CA4');
  ok('senza Whisper: doc received, audio c\'è, e lo DICE', r.code === 200 && doc.status === 'received' && doc.transcriptStatus === 'unavailable' && !!doc.audioUrl, doc.transcriptStatus);
  ok('…riassunto onesto, mai vuoto', doc.summary.includes('nessuna trascrizione'));
  const lead = leads().find(([, l]) => l.phone === '+393350000002');
  ok('il lead nasce comunque (placeholder in inglese: replyLang non deve mai vedere un default italiano)', !!lead && lead[1].message.startsWith('[voicemail]'), lead && lead[1].message);
  process.env.OPENAI_API_KEY = savedKey;
}

// ─── 10. AI giù con trascrizione inglese: fallback nella lingua giusta ─────
{
  whisperText = 'Hello, my name is John, I am calling about the apartment in Pigneto, is it still available?';
  aiJson = null;   // anthropic 500 → fallback deterministico
  await call(inbound, { query: { k: KEY }, headers: { host: 'boomrome.com' }, body: { CallSid: 'CA5', From: '+447700900123' } });
  const r = await call(recording, { query: { k: KEY }, body: { CallSid: 'CA5', RecordingStatus: 'completed', RecordingDuration: '19', RecordingUrl: 'https://api.twilio.com/x/Recordings/RE5' } });
  const doc = DB.get('phoneCalls/CA5');
  ok('AI giù → riassunto dalle parole vere', r.code === 200 && doc.summary.startsWith('Hello, my name is John'));
  ok('…bozza fallback in INGLESE (le parole battono tutto)', doc.language === 'en' && doc.draftReply === fallbackDraft('en'), doc.language);
  ok('…e la casa la trova comunque l\'aritmetica gratis', doc.propertyId === 'l1', doc.propertyId);
}

// ─── 11. stesso numero già in pipeline → si arricchisce, non si duplica ────
{
  DB.set('leads/portal9', { id: 'portal9', source: 'idealista', phone: '3312223334', message: 'Richiesta dal portale', status: 'new', createdAt: new Date().toISOString() });
  whisperText = 'Buongiorno, vi avevo scritto su Idealista, volevo sapere del bilocale, grazie';
  aiJson = { language: 'it', summary: 'Richiama chi aveva già scritto su Idealista.', intent: 'nuova-richiesta', urgency: 'medium', suggestedAction: 'whatsapp', draftReply: 'Ciao! Ti rispondo subito. Valentino · BOOM' };
  await call(inbound, { query: { k: KEY }, headers: { host: 'boomrome.com' }, body: { CallSid: 'CA6', From: '+393312223334' } });
  const before = leads().length;
  const r = await call(recording, { query: { k: KEY }, body: { CallSid: 'CA6', RecordingStatus: 'completed', RecordingDuration: '12', RecordingUrl: 'https://api.twilio.com/x/Recordings/RE6' } });
  ok('nazionale in archivio + internazionale dal caller ID → un lead solo', leads().length === before && r.out.leadId === 'portal9' && r.out.leadCreated === false, r.out);
  ok('…e il messaggio vocale si aggiunge lì', DB.get('leads/portal9').message.includes('Idealista'), DB.get('leads/portal9').message);
}

// ─── 12. callback orfano (inbound mai arrivato): il numero dal lookup ──────
{
  whisperText = 'Salve, chiamavo per informazioni sugli appartamenti, potete richiamarmi?';
  aiJson = { language: 'it', summary: 'Chiede informazioni generali.', intent: 'nuova-richiesta', urgency: 'low', suggestedAction: 'richiama', draftReply: 'Ciao! Come posso aiutarti? Valentino · BOOM' };
  const r = await call(recording, { query: { k: KEY }, body: { CallSid: 'CA_NoDoc', RecordingStatus: 'completed', RecordingDuration: '9', RecordingUrl: 'https://api.twilio.com/x/Recordings/RE7' } });
  const doc = DB.get('phoneCalls/CA_NoDoc');
  ok('senza doc precedente: il doc nasce dal callback, numero dal lookup Twilio', r.code === 200 && !!doc && doc.from === '+393399999999', doc && doc.from);
}

// ─── 13. Telegram giù: il DATO resta, il handler non esplode ───────────────
{
  tgDown = true;
  whisperText = 'Buongiorno, cercavo una stanza in affitto a Roma per settembre, grazie mille';
  aiJson = { language: 'it', summary: 'Cerca una stanza per settembre.', intent: 'nuova-richiesta', urgency: 'medium', suggestedAction: 'whatsapp', draftReply: 'Ciao! Ti aiuto volentieri. Valentino · BOOM' };
  await call(inbound, { query: { k: KEY }, headers: { host: 'boomrome.com' }, body: { CallSid: 'CA7', From: '+393350000003' } });
  const r = await call(recording, { query: { k: KEY }, body: { CallSid: 'CA7', RecordingStatus: 'completed', RecordingDuration: '14', RecordingUrl: 'https://api.twilio.com/x/Recordings/RE8' } });
  const doc = DB.get('phoneCalls/CA7');
  ok('Telegram giù → 200, doc completo, lead creato lo stesso', r.code === 200 && doc.status === 'received' && !!r.out.leadId, r.out);
  ok('…e telegramNotifiedAt NON stampato (mai fingere un ping riuscito)', !doc.telegramNotifiedAt);
  tgDown = false;
}

// ─── 14. le giunzioni (asserite sulla sorgente e sui file veri) ────────────
{
  const vercel = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');
  const vj = JSON.parse(vercel);
  ok('vercel.json: /chiamate riscritta sulla pagina', (vj.rewrites || []).some((r) => r.source === '/chiamate' && r.destination === '/chiamate.html'));
  const privGroup = (vj.headers || []).find((h) => h.source.includes('|chiamate|'));
  ok('vercel.json: /chiamate è privata (noindex + no-store)',
    !!privGroup && privGroup.headers.some((h) => /noindex/.test(h.value)) && privGroup.headers.some((h) => /no-store/.test(h.value)));
  ok('vercel.json: recording.js ha 60s (audio+Whisper+AI non stanno in 10)', ((vj.functions || {})['api/phone/recording.js'] || {}).maxDuration === 60);

  const fsRules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  ok('firestore.rules: phoneCalls admin-only (la lezione propertyLocks)', /phoneCalls\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(fsRules));
  const stRules = readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8');
  ok('storage.rules: phone-calls/ admin-only (senza match → upload 403)', /phone-calls\/\{allPaths=\*\*\}/.test(stRules));

  const page = readFileSync(new URL('../../chiamate.html', import.meta.url), 'utf8');
  ok('la dashboard esiste e ascolta phoneCalls', page.includes("collection('phoneCalls')") && page.includes('requireAuth'));
  const portal = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  ok('il portal linka il Centralino in Console', portal.includes("window.open('/chiamate'"));

  // L'ORDINE che conta, sulla sorgente: il doc si scrive PRIMA del ping — un
  // Telegram giù non deve mai poter perdere la chiamata.
  const rec = readFileSync(new URL('../../api/phone/recording.js', import.meta.url), 'utf8');
  ok('recording.js: doc patch PRIMA di tgSend', rec.indexOf('await fsPatch(docPath, patch)') < rec.indexOf('tgSend('));
  ok('recording.js: Whisper senza lingua forzata (i clienti parlano anche inglese)', !/append\('language'/.test(rec));
}

console.log(fails ? `\n${fails} FAILED` : '\nAll phone checks passed');
process.exit(fails ? 1 : 0);
