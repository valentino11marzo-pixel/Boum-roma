// tests/istanbul/run.mjs — suite `istanbul`
// BOOM İSTANBUL → ROMA (25/10/2026): la pagina in turco per chi si
// trasferisce a Roma, e la sua porta.
//
// Cosa si tiene, e perché:
//  1. LA PORTA (api/leads/web.js, modulo 'istanbul', handler VERO su un
//     Firestore in memoria): honeypot muto, nome e recapito obbligatori, rate
//     limit; il numero turco «0532 …» diventa +905321234567 (prima la card
//     Telegram indovinava +39532…), il digitato resta in raw.phone; lo stesso
//     requestId due volte = UN lead e UNA attività; schema `leads` di Roma
//     (market 'roma', sourceRef/origin 'istanbul', tenant, language 'tr' o
//     'en' dalla pagina letta); il riassunto per l'operatore apre con
//     «İSTANBUL → ROMA — » in italiano; l'attività è scritta PRIMA della
//     risposta. Poi la macchina vera: Lead Brain e notify-pending (handler
//     veri) — la card dice «🇹🇷 İstanbul → Roma», il WhatsApp va a +90… in
//     INGLESE (nessun ramo della macchina scrive turco), il 🤖 c'è (è Roma).
//  2. LA PAGINA: una porta sola nel primo schermo, nessun quiz, i tetti di
//     parole, FAQPage = le <details> visibili (parte turca), nessuna frase
//     vietata (anche in turco), nessun numero di clienti, i prezzi = catalogo
//     e Condizioni, ogni frase con un fatto è nella lista dei fatti con la
//     sua fonte, e la lingua delle risposte vive in UN posto
//     (scripts/istanbul-replies.mjs): spento, nessuna promessa di risposte in
//     turco da nessuna parte (testo, JSON-LD, llms.txt).
//  3. IL BROWSER a 390px: niente scorrimento laterale, la porta intera nel
//     primo schermo, il maiuscolo turco giusto (GELİYORSUN, mai GELIYORSUN),
//     un POST per tap anche con tre tap, lo stesso requestId sul ritentativo,
//     ?lang=en che cambia lingua e la dichiara al server. Dalla revisione del
//     25/10: l'errore SOTTO il campo che lo causa (aria-invalid,
//     aria-describedby, bordo rosso), il 400 contact_required detto sul
//     recapito, «Gönderiliyor…» mentre il POST viaggia, bersagli ≥ 44px, il
//     grigio a .5, la nav a 320px; il riquadro dei cookie che non copre
//     «Bize yaz» (<body data-consent-late> + .hero-cta) né chi scrive nel
//     modulo oltre i 45 s, che arriva quando la porta è scorsa via, che
//     cambia lingua con l'interruttore, e il link «Çerez tercihleri» nel piede.
// Mutazioni (in fondo): le guardie si provano su copie ROTTE — la pagina
// che promette risposte in turco, che stampa «yüzlerce», un prezzo diverso
// dal catalogo, una domanda tolta dalla pagina ma rimasta nel FAQPage, un
// fatto senza fonte; e il server senza il ramo 409 del requestId.
//
// Run: node tests/istanbul/run.mjs   (la parte browser si auto-skippa senza playwright)

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 500) : ''}`); }
};
const section = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');
console.log('\n\x1b[1m▸ istanbul\x1b[0m  la pagina in turco e la sua porta: Roma, una porta, solo fatti con la fonte');

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.CRON_SECRET = 'cron-test';
process.env.TELEGRAM_BOT_TOKEN = 'tok';
process.env.TELEGRAM_CHAT_ID = '42';
delete process.env.ANTHROPIC_API_KEY;

// ════════════════════════════════════════════════════════════════════════
// Firestore finto (lo stesso di tests/apply): campi CODIFICATI, 409 su un
// documentId che esiste, query in ordine di nome senza orderBy.
// ════════════════════════════════════════════════════════════════════════
const DB = new Map();
const TG = [];
let autoN = 0;
const typeOf = (v) => (v ? Object.keys(v)[0] : undefined);
const valOf = (v) => {
  const t = typeOf(v);
  if (t === 'timestampValue') return Date.parse(v.timestampValue);
  if (t === 'integerValue') return Number(v.integerValue);
  if (t === 'doubleValue') return v.doubleValue;
  return v[t];
};
const sameKind = (a, b) => {
  const num = (t) => t === 'integerValue' || t === 'doubleValue';
  return typeOf(a) === typeOf(b) || (num(typeOf(a)) && num(typeOf(b)));
};
const getField = (fields, p) => p.split('.').reduce((cur, k) => {
  if (!cur) return undefined;
  const f = cur[k];
  return f && f.mapValue && p.indexOf(k) < p.length - k.length ? f.mapValue.fields : f;
}, fields);
function matches(fields, where) {
  if (!where) return true;
  if (where.compositeFilter) {
    const rs = where.compositeFilter.filters.map((f) => matches(fields, f));
    return where.compositeFilter.op === 'OR' ? rs.some(Boolean) : rs.every(Boolean);
  }
  if (where.unaryFilter) return true;
  const f = where.fieldFilter;
  const actual = getField(fields, f.field.fieldPath);
  if (actual === undefined) return false;
  if (f.op === 'IN') return (f.value.arrayValue.values || []).some((x) => sameKind(actual, x) && valOf(actual) === valOf(x));
  if (!sameKind(actual, f.value)) return false;
  const a = valOf(actual), b = valOf(f.value);
  switch (f.op) {
    case 'EQUAL': return a === b;
    case 'NOT_EQUAL': return a !== b;
    case 'GREATER_THAN': return a > b;
    case 'GREATER_THAN_OR_EQUAL': return a >= b;
    case 'LESS_THAN': return a < b;
    case 'LESS_THAN_OR_EQUAL': return a <= b;
    default: return false;
  }
}
const docOut = (p, fields) => ({ name: `projects/p/databases/(default)/documents/${p}`, fields, updateTime: new Date().toISOString() });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit') || u.includes('securetoken')) return json({ idToken: 'fake', localId: 'admin', expiresIn: '3600' });
  if (u.includes('api.telegram.org')) {
    TG.push({ method: u.split('/').pop(), body: opts.body ? JSON.parse(opts.body) : {} });
    return json({ ok: true, result: { message_id: 1000 + TG.length } });
  }
  if (!u.includes('firestore.googleapis.com')) return json({});
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    let rows = [...DB.entries()].filter(([k, d]) => k.startsWith(coll + '/') && k.split('/').length === 2 && matches(d.fields, q.where));
    const orderBy = q.orderBy || [];
    rows = rows.filter(([, d]) => orderBy.every((o) => o.field.fieldPath === '__name__' || getField(d.fields, o.field.fieldPath) !== undefined));
    rows.sort(([ka, da], [kb, db]) => {
      for (const o of orderBy) {
        const dir = o.direction === 'DESCENDING' ? -1 : 1;
        const a = o.field.fieldPath === '__name__' ? ka : valOf(getField(da.fields, o.field.fieldPath));
        const b = o.field.fieldPath === '__name__' ? kb : valOf(getField(db.fields, o.field.fieldPath));
        if (a < b) return -dir; if (a > b) return dir;
      }
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return json(rows.slice(0, q.limit || 1000).map(([k, d]) => ({ document: docOut(k, d.fields) })));
  }
  if (u.includes(':commit') || u.includes(':batchGet')) return json({ writeResults: [] });
  const m = u.match(/documents\/([^?]+)/);
  const p = m ? decodeURIComponent(m[1]) : '';
  const method = opts.method || 'GET';
  if (method === 'GET') { const d = DB.get(p); return d ? json(docOut(p, d.fields)) : json({ error: { code: 404 } }, 404); }
  if (method === 'POST') {
    const qid = u.match(/documentId=([^&]+)/);
    const id = qid ? decodeURIComponent(qid[1]) : 'auto' + String(++autoN).padStart(4, '0');
    const key = `${p}/${id}`;
    if (DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, { fields: { ...(body.fields || {}) } });
    return json(docOut(key, DB.get(key).fields));
  }
  if (method === 'PATCH') {
    const prev = DB.has(p) ? DB.get(p).fields : {};
    DB.set(p, { fields: { ...prev, ...(body.fields || {}) } });
    return json(docOut(p, DB.get(p).fields));
  }
  return json({});
};
const plain = (v) => {
  const t = typeOf(v);
  if (t === 'mapValue') return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  if (t === 'arrayValue') return (v.arrayValue.values || []).map(plain);
  if (t === 'nullValue') return null;
  if (t === 'integerValue') return Number(v.integerValue);
  return v[t];
};
const docOf = (p) => { const d = DB.get(p); return d ? Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, plain(v)])) : null; };
const docsIn = (coll) => [...DB.keys()].filter((k) => k.startsWith(coll + '/') && k.split('/').length === 2);
const mockRes = () => {
  const r = { statusCode: 200, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.end = () => r;
  return r;
};
let ipN = 0;
const post = (handler, body, ip) => {
  const res = mockRes();
  return Promise.resolve(handler({ method: 'POST', body, headers: { 'x-forwarded-for': ip || '10.9.0.' + (++ipN) }, query: {}, socket: {} }, res)).then(() => res);
};

const web = await import('../../api/leads/web.js');
const market = await import('../../api/_market.js');
const { replyLang } = await import('../../api/_lang.js');
const { stage0 } = await import('../../api/leads/brain.js');
const brainHandler = (await import('../../api/leads/brain.js')).default;
const notifyHandler = (await import('../../api/telegram/notify-pending.js')).default;
const { deskPatch } = await import('../../api/homie/_lead.js');

const base = (over = {}) => ({
  form: 'istanbul', name: 'Elif Yılmaz', email: '', phone: '0532 123 45 67',
  move_in_date: '2027-09', message: 'Sapienza, yüksek lisans. Trastevere ya da San Lorenzo, bütçe 900.',
  page_lang: 'tr', requestId: 'a1b2c3d4e5f60718', attribution: 'ai_assistant · /istanbul', company: '', ...over,
});

// ════════════════════════════════════════════════════════════════════════
section('1 · la porta (api/leads/web.js, modulo istanbul) — handler vero');
// ════════════════════════════════════════════════════════════════════════
async function checkDoor(handler, tag = '') {
  const before = docsIn('leads').length, actBefore = docsIn('activityLog').length;
  const r1 = await post(handler, base());
  const id = r1.body && r1.body.id;
  const lead = id ? docOf('leads/' + id) : null;
  const acts = docsIn('activityLog').length - actBefore;
  const r2 = await post(handler, base());               // lo stesso caricamento di pagina ritenta
  const leadsAfter = docsIn('leads').length - before;
  const acts2 = docsIn('activityLog').length - actBefore;
  return { r1, r2, id, lead, acts, acts2, leadsAfter, tag };
}
const D = await checkDoor(web.default);
const L = D.lead || {};
ok('200 e un id deterministico dal requestId', D.r1.statusCode === 200 && D.id === 'web_istanbul_a1b2c3d4e5f60718', D.r1.body);
ok('lo stesso requestId due volte = UN lead, la seconda risposta dice duplicate', D.leadsAfter === 1 && D.r2.statusCode === 200 && D.r2.body.duplicate === true && D.r2.body.id === D.id, { leads: D.leadsAfter, r2: D.r2.body });
ok('l\'attività è scritta PRIMA della risposta, e una volta sola', D.acts === 1 && D.acts2 === 1, { acts: D.acts, acts2: D.acts2 });
ok('schema leads di Roma: source web, status new, intent relocation', L.source === 'web' && L.status === 'new' && L.intent === 'relocation' && L.ingestedBy === 'web-form', L);
ok('market roma, sourceRef e origin istanbul, leadType tenant', L.market === 'roma' && L.sourceRef === 'istanbul' && L.origin === 'istanbul' && L.leadType === 'tenant', L);
ok('language tr (la pagina letta), e replyLang risponde comunque in INGLESE', L.language === 'tr' && replyLang(L) === 'en', { language: L.language, reply: replyLang(L) });
ok('il numero turco diventa E.164 +905321234567, il digitato resta in raw.phone', L.phone === '+905321234567' && L.raw && L.raw.phone === '0532 123 45 67', { phone: L.phone, raw: L.raw && L.raw.phone });
ok('il riassunto per l\'operatore apre con «İSTANBUL → ROMA — » e dice il mese in italiano', /^İSTANBUL → ROMA — /.test(L.message || '') && /move-in: settembre 2027/.test(L.message) && /pagina: turca/.test(L.message) && L.notes === L.message, L.message);
ok('le parole della persona chiudono il riassunto', /Sapienza, yüksek lisans/.test(L.message || ''), L.message);
ok('l\'attribuzione dal boom_source arriva sul lead', L.attribution === 'ai_assistant · /istanbul', L.attribution);
ok('raw.extra: page_lang chiuso e requestId fuori da extra', L.raw && L.raw.extra && L.raw.extra.page_lang === 'tr' && !('requestId' in L.raw.extra) && L.raw.requestId === 'a1b2c3d4e5f60718', L.raw);
{
  const r = await post(web.default, base({ requestId: 'enpage00000000001', page_lang: 'en', phone: '+90 532 999 88 77', message: '' }));
  const l = docOf('leads/' + r.body.id) || {};
  ok('page_lang en → language en e «pagina: inglese»', l.language === 'en' && /pagina: inglese/.test(l.message) && l.phone === '+905329998877', { language: l.language, message: l.message, phone: l.phone });
  const r2 = await post(web.default, base({ requestId: 'bogus00000000001', page_lang: 'xx<script>' }));
  const l2 = docOf('leads/' + r2.body.id) || {};
  ok('page_lang fuori lista: scartato (mai testo libero), lingua di ripiego tr', l2.language === 'tr' && !/pagina:/.test(l2.message) && !(l2.raw && l2.raw.extra && 'page_lang' in l2.raw.extra), { m: l2.message, extra: l2.raw && l2.raw.extra });
  const r3 = await post(web.default, base({ requestId: 'itnumber00000001', phone: '333 1234567', move_in_date: 'unsure' }));
  const l3 = docOf('leads/' + r3.body.id) || {};
  ok('un numero italiano scritto sulla pagina turca resta com\'è (la card lo legge +39)', l3.phone === '333 1234567' && /move-in: da decidere/.test(l3.message), { phone: l3.phone, m: l3.message });
  const r4 = await post(web.default, base({ requestId: 'mailonly00000001', phone: '', email: 'elif@example.com' }));
  ok('solo email: entra', r4.statusCode === 200 && (docOf('leads/' + r4.body.id) || {}).email === 'elif@example.com');
}
{
  const n0 = docsIn('leads').length;
  const hp = await post(web.default, base({ requestId: 'honeypot00000001', company: 'Acme' }));
  ok('honeypot: 200 muto, nessun lead', hp.statusCode === 200 && hp.body.id === null && docsIn('leads').length === n0, hp.body);
  const nn = await post(web.default, base({ requestId: 'noname0000000001', name: '' }));
  ok('senza nome: 400 contact_required, nessun lead', nn.statusCode === 400 && docsIn('leads').length === n0, nn.body);
  const nc = await post(web.default, base({ requestId: 'nocontact0000001', phone: '', email: '' }));
  ok('senza recapito: 400, nessun lead', nc.statusCode === 400 && docsIn('leads').length === n0, nc.body);
  const codes = [];
  for (let i = 0; i < 10; i++) codes.push((await post(web.default, base({ requestId: 'flood' + String(i).padStart(11, '0') }), '7.7.7.7')).statusCode);
  ok('rate limit: lo stesso IP viene fermato (429)', codes.includes(429) && codes[0] === 200, codes);
}
{
  // Gli altri moduli: schema di sempre, nessun campo nuovo, lingua non indovinata
  const r = await post(web.default, { form: 'contact', name: 'Anna', email: 'anna@example.com', phone: '0532 123 45 67' });
  const l = docOf('leads/' + r.body.id) || {};
  ok('un altro modulo resta com\'era: language null, niente market/origin, numero non riscritto', l.language === null && !('market' in l) && !('origin' in l) && l.phone === '0532 123 45 67' && /^Contatto/.test(l.message), l);
}
{
  const P = market.phoneE164;
  const cases = [['0532 123 45 67', '+905321234567'], ['532 123 45 67', '+905321234567'], ['+90 (532) 123-45-67', '+905321234567'],
    ['905321234567', '+905321234567'], ['00905321234567', '+905321234567'], ['333 1234567', null], ['0212 123 45 67', null], ['', null]];
  const bad = cases.filter(([i, o]) => P(i, 'tr') !== o).map(([i, o]) => `${i} → ${P(i, 'tr')} (atteso ${o})`);
  ok('phoneE164(…, "tr"): i cellulari turchi in ogni forma, mai un fisso o un numero italiano', !bad.length, bad);
  ok('cityPhone dei desk città invariato', market.cityPhone('06 12345678', 'amsterdam') === '+31612345678' && market.cityPhone('612 345 678', 'madrid') === '+34612345678');
}

// ════════════════════════════════════════════════════════════════════════
section('1b · la macchina di Roma lo lavora al completo (Brain e card veri)');
// ════════════════════════════════════════════════════════════════════════
ok('è un inquilino di ROMA: né città, né Réunion, né ente, e nessun veto romano', !market.isCityMarket(L) && !market.isReunion(L) && !market.isB2B(L) && market.notRomeTenant(L) === null);
ok('originOf nomina la porta (origin o sourceRef)', (market.originOf(L) || {}).label === 'İstanbul → Roma' && (market.originOf({ sourceRef: 'istanbul' }) || {}).flag === '🇹🇷' && market.originOf({ sourceRef: 'contact' }) === null);
{
  const s0 = stage0(L, new Map());
  ok('Lead Brain: language tr vale come segnale expat (+15)', /expat\/EN/.test(s0.reason || ''), s0);
}
{
  // Il lead è nuovo: prima il Brain (voto), poi la card.
  for (const k of [...DB.keys()]) if (k.startsWith('leads/') && k !== 'leads/' + D.id) DB.delete(k);
  const rb = mockRes();
  await brainHandler({ method: 'POST', headers: { authorization: 'Bearer cron-test' }, query: {} }, rb);
  const graded = docOf('leads/' + D.id) || {};
  ok('Brain: 200 e un voto, mai dead', rb.statusCode === 200 && !!graded.grade && graded.grade !== 'dead', { s: rb.statusCode, grade: graded.grade, why: graded.gradeReason });
  TG.length = 0;
  const rn = mockRes();
  await notifyHandler({ method: 'GET', headers: { authorization: 'Bearer cron-test' }, query: {} }, rn);
  const card = TG.find((t) => t.method === 'sendMessage' && /Elif Yılmaz/.test(t.body.text || ''));
  const text = card ? card.body.text : '';
  const kb = card ? JSON.stringify(card.body.reply_markup || {}) : '';
  const wa = card ? (card.body.reply_markup.inline_keyboard.flat().find((b) => /wa\.me/.test(b.url || '')) || {}).url || '' : '';
  ok('notify-pending: la card parte e dice «🇹🇷 İstanbul → Roma»', !!card && text.includes('🇹🇷 İstanbul → Roma'), text.slice(0, 200));
  ok('la card non parla di un altro mercato (nessun 🇷🇪, nessuna città)', !!card && !/🇷🇪|🇳🇱|🇪🇸|🇫🇷|🇩🇪/.test(text), text.slice(0, 200));
  ok('WhatsApp verso +90…, col messaggio di Roma in INGLESE', wa.startsWith('https://wa.me/905321234567?text=') && /This%20is%20Valentino%20from%20BOOM%20Roma|This is Valentino from BOOM Roma/.test(decodeURIComponent(wa)) && !/Ciao|Sono Valentino/.test(decodeURIComponent(wa)), wa.slice(0, 160));
  ok('il 🤖 Passa alla Segretaria c\'è (è un inquilino di Roma)', kb.includes('sg:' + D.id), kb.slice(0, 200));
}
{
  const marker = 'Merhaba BOOM, İstanbul\'dan Roma\'ya taşınıyorum. (Moving from Istanbul to Rome.)';
  const p1 = deskPatch(null, marker), p2 = deskPatch({ market: 'amsterdam' }, marker), p3 = deskPatch({ origin: 'istanbul' }, 'Hi BOOM Amsterdam, I\'m moving to Amsterdam.');
  ok('WhatsApp: il marcatore della pagina scrive origin istanbul, MAI un market', JSON.stringify(p1) === '{"origin":"istanbul"}' && JSON.stringify(p2) === '{"origin":"istanbul"}' && p3.market === 'amsterdam' && !('origin' in p3), { p1, p2, p3 });
  ok('il testo inglese del marcatore conta uguale', market.originFromText('Hi BOOM, I\'m moving from Istanbul to Rome.') === 'istanbul' && market.originFromText('ciao, cerco casa a Roma') === null);
}
{
  const ai = read('api/agent/ai.reply.js');
  ok('ai.reply: una lingua che non scriviamo (tr) passa da replyLang, mai all\'italiano', /declaredLang\.startsWith\('en'\)[\s\S]{0,160}replyLang\(lead\)/.test(ai) && /import \{ replyLang \} from '\.\.\/_lang\.js'/.test(ai));
  const pa = read('js/portal-app.js');
  ok('portale: bandiera 🇹🇷 per i lead tr (due liste + scheda persona), wizard in inglese', (pa.match(/l\.language === 'tr' \? '🇹🇷'/g) || []).length === 2 && /toLowerCase\(\) === 'tr' \? '🇹🇷'/.test(pa) && /=== 'tr' \? 'en'/.test(pa));
}

// ════════════════════════════════════════════════════════════════════════
section('2 · la pagina');
// ════════════════════════════════════════════════════════════════════════
const HTML = read('istanbul.html');
const LLMS = read('llms.txt');
const { faqItems } = await import('../../scripts/owner-faq.mjs');
const RP = await import('../../scripts/istanbul-replies.mjs');

const ENT = { nbsp: ' ', amp: '&', quot: '"', reg: '®', rarr: '→', middot: '·', copy: '©', apos: "'", lt: '<', gt: '>' };
const dec = (t) => t.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : ' '));
// Toglie un elemento bilanciato (stesso tag) ogni volta che l'apertura combacia.
function dropEl(h, re) {
  let m;
  while ((m = re.exec(h))) {
    const tag = m[1], i = m.index;
    const t = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g'); t.lastIndex = i;
    let d = 0, k, done = false;
    while ((k = t.exec(h))) { if (k[1]) d--; else d++; if (d === 0) { h = h.slice(0, i) + ' ' + h.slice(t.lastIndex); done = true; break; } }
    if (!done) break;
    re.lastIndex = 0;
  }
  return h;
}
/** Il testo come lo vede chi apre la pagina in una lingua: niente script,
 *  stili, commenti, svg, l'altra lingua, ciò che è [hidden]; le <details>
 *  chiuse mostrano solo il summary (open:true = tutto). `blocks` mette un
 *  a capo fra gli elementi di blocco. */
function visible(html, lang = 'tr', { open = false, blocks = false } = {}) {
  let b = html.slice(html.indexOf('<body'));
  b = b.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<noscript[\s\S]*?<\/noscript>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<span class="num">[^<]*<\/span>/g, ' ');
  const other = lang === 'tr' ? 'en' : 'tr';
  b = dropEl(b, new RegExp(`<(span|p|div|a)\\b[^>]*class="[^"]*\\bl-${other}\\b[^"]*"[^>]*>`, 'g'));
  b = dropEl(b, /<(div|p|section|form)\b[^>]*\shidden(?:[\s>=])/g);
  if (!open) b = b.replace(/(<details\b[^>]*>\s*<summary>[\s\S]*?<\/summary>)([\s\S]*?)(<\/details>)/g, (m, a, c, z) => a + z);
  if (blocks) b = b.replace(/<\/(p|li|dd|dt|h1|h2|h3|h4|summary|div|label|small|button)>|<br\s*\/?>|<(dd|dt|li)\b/g, '\n$&');
  b = dec(b.replace(/<[^>]+>/g, ' '));
  return blocks ? b.split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean) : b.replace(/\s+/g, ' ').trim();
}
const words = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const between = (h, a, z) => { const i = h.indexOf(a); return i < 0 ? '' : h.slice(i, h.indexOf(z, i) + z.length); };
const ldBlocks = (h) => [...h.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map((m) => JSON.parse(m[1]));
const ldNodes = (h) => ldBlocks(h).flatMap((d) => d['@graph'] || [d]);
const ldStrings = (x, out = []) => { if (typeof x === 'string') out.push(x); else if (Array.isArray(x)) x.forEach((y) => ldStrings(y, out)); else if (x && typeof x === 'object') Object.values(x).forEach((y) => ldStrings(y, out)); return out; };
const attrsRead = (h) => [...h.replace(/<script[\s\S]*?<\/script>/g, ' ').matchAll(/\s(?:content|alt|title|aria-label|placeholder)="([^"]*)"/g)].map((m) => dec(m[1]));
const istSection = (txt) => { const i = txt.indexOf('## BOOM İstanbul → Roma'); const j = txt.indexOf('\n## ', i + 1); return i < 0 ? '' : txt.slice(i, j < 0 ? txt.length : j); };

// ── testa ──
{
  const head = HTML.slice(0, HTML.indexOf('</head>'));
  const title = (head.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
  const desc = (head.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
  ok('<html lang="tr">, charset, canonical https://www.boomrome.com/istanbul', /^<!DOCTYPE html>\s*<html lang="tr">/.test(HTML) && /<meta charset="UTF-8">/.test(head) && head.includes('<link rel="canonical" href="https://www.boomrome.com/istanbul">'));
  ok(`titolo ≤62 (${[...title].length}) e descrizione 110–165 (${[...desc].length})`, [...title].length <= 62 && [...desc].length >= 110 && [...desc].length <= 165);
  ok('og:locale tr_TR con en_US come alternativa, nessun hreflang verso ?lang=', /og:locale" content="tr_TR"/.test(head) && /og:locale:alternate" content="en_US"/.test(head) && !/<link\b[^>]*hreflang/i.test(head));
  ok('consenso negato di default PRIMA di config, boom-consent e boom-track una volta sola', /gtag\('consent','default',\{ad_storage:'denied'[^}]*analytics_storage:'denied'/.test(head) && head.indexOf("'consent','default'") < head.indexOf("gtag('config'") && (HTML.match(/\/js\/boom-consent\.js/g) || []).length === 1 && (HTML.match(/\/js\/boom-track\.js/g) || []).length === 1);
  ok('boom-2026.css, oro #FFD700, mai #D4AF37', head.includes('/css/boom-2026.css') && !/#D4AF37/i.test(HTML));
  const cfg = (await import('node:module')).createRequire(import.meta.url)(path.join(R, 'scripts/seo-config.js')).PAGES['istanbul.html'] || {};
  ok('seo-config: manualHead, e titolo/descrizione uguali alla pagina', cfg.manualHead === true && cfg.title === dec(title) && cfg.description === dec(desc) && cfg.lang === 'tr');
  const png = fs.readFileSync(path.join(R, 'og-istanbul.png'));
  ok(`og-istanbul.png: PNG 1200×630, ≤120 KB (${Math.round(png.length / 1024)} KB)`, png.slice(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.length <= 120 * 1024 && head.includes('https://www.boomrome.com/og-istanbul.png'));
  ok('sitemap: /istanbul con lastmod 2026-10-25', /<loc>https:\/\/www\.boomrome\.com\/istanbul<\/loc>\s*<lastmod>2026-10-25<\/lastmod>/.test(read('sitemap.xml')));
  const vj = JSON.parse(read('vercel.json'));
  const al = (vj.redirects || []).find((r) => r.source === '/(tr|turkiye|turkey)');
  ok('vercel.json: /tr, /turkiye, /turkey → /istanbul, permanente', !!al && al.destination === '/istanbul' && al.permanent === true);
  const foot = ['index.html', 'apartments.html', 'apartment-detail.html', 'your-money.html', 'how-it-works.html', 'try.html'].filter((f) => !/<a href="\/istanbul" lang="tr">İstanbul → Roma · Türkçe<\/a>/.test(read(f)));
  ok('il piede «Company & Markets» delle sei pagine (e le sorgenti dei builder) linka /istanbul', !foot.length && /href="\/istanbul\.html" lang="tr"/.test(read('design/pages-deco/pt.html')) && /href="\/istanbul\.html" lang="tr"/.test(read('design/pages-deco/patch-lotto2.py')), foot);
}

// ── una porta, nessun quiz, la porta nel primo blocco ──
{
  const forms = HTML.match(/<form\b/g) || [];
  const fields = [...HTML.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].filter((m) => !/tabindex="-1"/.test(m[2]) && !/type="hidden"/.test(m[2]));
  ok('UNA porta: un solo <form>, quattro campi (nome, recapito, mese, nota) + honeypot «company»', forms.length === 1 && fields.length === 4 && /id="fCompany" name="company"/.test(HTML), fields.map((m) => m[2].match(/id="(\w+)"/)?.[1]));
  ok('nessun quiz: niente radio/checkbox, niente passi, niente <dialog>, niente range', !/type="(radio|checkbox|range)"/.test(HTML) && !/<dialog\b/.test(HTML) && !/\b(adım|step) \d|data-step/i.test(HTML));
  const ctas = [...HTML.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*?Bize yaz/g)].map((m) => m[1]);
  ok('ogni «Bize yaz» porta alla stessa porta (#yaz) o la invia', ctas.length >= 2 && ctas.every((h) => h === '#yaz'), ctas);
  ok('la porta sta nell\'hero, prima di ogni sezione', HTML.indexOf('id="trForm"') > HTML.indexOf('<header class="hero">') && HTML.indexOf('id="trForm"') < HTML.indexOf('<section'));
  ok('senza JS il bottone nasce spento (nessun GET coi dati) e c\'è la via WhatsApp/email', /<button type="submit" class="paybtn" id="fGo" disabled>/.test(HTML) && /<noscript><p>[\s\S]*wa\.me[\s\S]*mailto:hello@boom-rome\.com/.test(HTML));
  const was = [...HTML.matchAll(/href="(https:\/\/wa\.me\/393313251961\?text=[^"]+)"/g)].map((m) => decodeURIComponent(m[1].split('text=')[1]));
  ok('WhatsApp col marcatore turco/inglese che il server riconosce (origin istanbul)', was.length >= 2 && was.every((t) => market.originFromText(t) === 'istanbul' && /İstanbul'dan Roma'ya taşınıyorum/.test(t) && /moving from Istanbul to Rome/i.test(t)), was);
  ok('il modulo posta a /api/leads/web con form istanbul, requestId, page_lang e attribution', /fetch\('\/api\/leads\/web'/.test(HTML) && /form:'istanbul'/.test(HTML) && /requestId:RID/.test(HTML) && /page_lang:/.test(HTML) && /input\[name="boom_source"\]/.test(HTML));
  ok('la conversione parte solo dopo l\'ok del server', /if\(!j\|\|!j\.ok\)throw[\s\S]{0,400}boom-conversion/.test(HTML));
  ok('i mesi da una tabella fissa, mai Intl; la lingua mai dal browser', /var TR_AY=\['Ocak','Şubat'/.test(HTML) && !/Intl\.|toLocale|navigator\.language/.test(between(HTML, '<script>\nfunction boomTrack', '</script>')));
}

// ── i tetti di parole ──
const BUDGET = { load: 450, hero: 70, block: 90, faqAnswer: 36 };
{
  const loadTr = words(visible(HTML, 'tr'));
  const heroTr = words(visible('<body>' + between(HTML, '<header class="hero">', '</header>'), 'tr'));
  const blocks = ['vize', 'video', 'sozlesme', 'fiyat', 'faq'].map((id) => [id, words(visible('<body>' + between(HTML, `<section id="${id}"`, '</section>'), 'tr'))]);
  ok(`turco all'apertura ≤ ${BUDGET.load} parole (${loadTr})`, loadTr <= BUDGET.load);
  ok(`hero + porta ≤ ${BUDGET.hero} parole (${heroTr})`, heroTr <= BUDGET.hero);
  ok(`ogni blocco ≤ ${BUDGET.block} parole (${blocks.map(([a, b]) => a + ' ' + b).join(' · ')})`, blocks.every(([, n]) => n <= BUDGET.block));
  ok('sei blocchi al massimo (hero + cinque sezioni)', (HTML.match(/<section\b/g) || []).length <= 5);
  const fa = faqItems(HTML, 'tr');
  const long = fa.filter((q) => words(q.acceptedAnswer.text) > BUDGET.faqAnswer).map((q) => `${q.name} (${words(q.acceptedAnswer.text)})`);
  ok(`ogni risposta della FAQ ≤ ${BUDGET.faqAnswer} parole`, fa.length >= 6 && !long.length, long);
}

// ── JSON-LD ──
function checkLd(html) {
  const errs = [];
  let nodes;
  try { nodes = ldNodes(html); } catch (e) { return ['JSON-LD che non parsa: ' + e.message]; }
  const org = nodes.find((n) => n['@id'] === 'https://www.boomrome.com/#organization');
  if (!org || org.legalName !== 'Egidi Immobiliare S.r.l.' || org.vatID !== 'IT17322991005' || (org.address || {}).streetAddress !== 'Via dei Coronari 181/184') errs.push('#organization non è Egidi Immobiliare S.r.l.');
  const bc = nodes.find((n) => n['@type'] === 'BreadcrumbList');
  const last = bc && bc.itemListElement[bc.itemListElement.length - 1];
  if (!last || last.item !== 'https://www.boomrome.com/istanbul') errs.push('BreadcrumbList non finisce sulla canonical');
  const page = nodes.find((n) => n['@type'] === 'WebPage');
  if (!page || page.inLanguage !== 'tr') errs.push('WebPage senza inLanguage tr');
  for (const sel of (page && page.speakable && page.speakable.cssSelector) || []) {
    for (const part of sel.split(/\s+/)) if (!new RegExp(`class="[^"]*\\b${part.slice(1)}\\b`).test(html)) errs.push('speakable verso un nodo che non c\'è: ' + sel);
  }
  const faq = nodes.find((n) => n['@type'] === 'FAQPage');
  const vis = faqItems(html, 'tr');
  if (!faq || faq.inLanguage !== 'tr' || JSON.stringify(faq.mainEntity) !== JSON.stringify(vis)) errs.push('il FAQPage non è la FAQ visibile (parte turca)');
  return errs;
}
ok('JSON-LD: #organization vera, percorso sulla canonical, WebPage tr, speakable su nodi veri, FAQPage = FAQ visibile', !checkLd(HTML).length, checkLd(HTML));

// ── i prezzi = catalogo e Condizioni ──
const CAT = read('api/_catalog.js');
const eurOf = (k) => Number((CAT.match(new RegExp(`'${k}':\\s*\\{\\s*eur:\\s*(\\d+)`)) || [])[1]);
const TERMS = read('terms.html');
const PFS = Number((TERMS.match(/PFS costs €(\d+), fixed, (?:<strong>)?IVA included/) || [])[1]);
const ALLOWED_EUR = new Set([eurOf('virtual-viewing'), eurOf('remote-move-pack'), PFS, 1200, 1440, 316.8, 1756.8]);
function priceErrors(html) {
  const errs = [];
  const num = (s, lang) => Number(lang === 'tr' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  for (const lang of ['tr', 'en']) {
    const t = visible(html, lang, { open: true });
    for (const m of t.matchAll(/(\d[\d.,]*)\s?€|€\s?(\d[\d.,]*)/g)) {
      const v = num((m[1] || m[2]).replace(/[.,]$/, ''), lang);
      if (!ALLOWED_EUR.has(v)) errs.push(`${lang}: ${m[0]}`);
    }
    for (const m of t.matchAll(/(KDV dahil|VAT incl\w*|IVA inclus\w*)/gi)) {
      const around = t.slice(Math.max(0, m.index - 24), m.index + 24);
      if (!/350/.test(around)) errs.push(`${lang}: «${m[0]}» accanto a un prezzo che il catalogo non dichiara IVA inclusa («${around}»)`);
    }
  }
  for (const n of ldNodes(html)) for (const o of [].concat(n.offers || [])) if (!ALLOWED_EUR.has(Number(o.price))) errs.push('Offer ' + o.price);
  return errs;
}
ok(`prezzi = catalogo (${eurOf('virtual-viewing')}, ${eurOf('remote-move-pack')}) e Condizioni (${PFS}, esempio §4.1), «IVA inclusa» solo sul ${PFS}`, eurOf('virtual-viewing') === 89 && eurOf('remote-move-pack') === 299 && PFS === 350 && !priceErrors(HTML).length, priceErrors(HTML));
{
  const tr = visible(HTML, 'tr', { open: true });
  const i = tr.indexOf('%10');
  ok('la commissione in turco porta il KDV entro 120 caratteri, ogni volta', [...tr.matchAll(/%10/g)].every((m) => /KDV|IVA/.test(tr.slice(m.index, m.index + 120))) && i > -1);
  const en = visible(HTML, 'en', { open: true });
  ok('e in inglese il VAT', [...en.matchAll(/10% of (?:one year's|a year's)/g)].every((m) => /VAT/.test(en.slice(m.index, m.index + 120))));
}

// ── le frasi che non diciamo, e nessun numero di clienti ──
// Le parole intere si confinano con \p{L} (non con \b, che in JavaScript è
// ASCII: «Kayıtlı» conterrebbe un «tl» isolato fra due «ı»).
const W = (x) => `(?<!\\p{L})(?:${x})(?!\\p{L})`;
const FORBIDDEN = new RegExp([
  '7/24', '24/7', 'yüzlerce', 'binlerce', '500\\+', 'dakika içinde', 'saat içinde (?:yanıt|cevap|dön)', 'within \\d+ (?:minutes|hours)',
  'İngilizce sözleşme', 'Türkçe sözleşme', 'English(?:-language)? (?:lease|contract)', 'contracts? in English', 'in English and Italian',
  'hayalindeki', 'sorunsuz', 'kusursuz', 'garantili', 'vize garanti', 'visa guarantee', 'guaranteed visa', W('en iyi'), W('anında'),
  'son fırsat', 'off-market', '₺', W('TL'), W('lira'), 'İstanbul ofis', 'Istanbul office', '€\\s?300(?!\\d)', '(?<![\\d.])300\\s?€',
  'havale ücretsiz', 'bank transfer is free', 'Biz BOOM olarak', 'tarafından', 'mektedir', 'maktadır',
].join('|'), 'iu');
const COUNT = /\b\d[\d.,]*\s*\+?\s*(?:öğrenci|müşteri|kiracı|aile|kişi|Türk|client|customer|student|tenant|famil|people|Turkish)/i;
function sayErrors(html, llms) {
  const corpora = [['tr', visible(html, 'tr', { open: true })], ['en', visible(html, 'en', { open: true })],
    ['attr', attrsRead(html).join('\n')], ['ld', ldStrings(ldBlocks(html)).join('\n')], ['llms', istSection(llms)]];
  const errs = [];
  for (const [k, t] of corpora) {
    const f = t.match(FORBIDDEN); if (f) errs.push(`${k}: «${f[0]}»`);
    const c = t.match(COUNT); if (c) errs.push(`${k}: numero di persone «${c[0]}»`);
  }
  return errs;
}
ok('nessuna frase vietata (7/24, yüzlerce, «İngilizce sözleşme», vize garantita, ₺, tempi di risposta…) e nessun numero di clienti — pagina, attributi, JSON-LD, llms.txt', !sayErrors(HTML, LLMS).length, sayErrors(HTML, LLMS));

// ── la lingua delle risposte: in un posto solo ──
const PROMISE_TR = /Türkçe[^.<\n]{0,40}(?:yanıt|yazış|destek|cevap|konuş)|(?:yanıt|yazış|destek|cevap|konuş)[^.<\n]{0,40}Türkçe/i;
const PROMISE_EN = /\b(?:repl\w*|write|answer\w*|support|speak)\b[^.<\n]{0,40}\bTurkish\b|\bTurkish\b[^.<\n]{0,20}\b(?:repl\w*|support|answer\w*|speaker)/i;
function repliesErrors(html, llms, on = RP.TURKISH_REPLIES) {
  const errs = [];
  if (RP.syncPage(html) !== html) errs.push('istanbul.html non è allineata a scripts/istanbul-replies.mjs (node scripts/istanbul-replies.mjs)');
  if (RP.syncLlms(llms) !== llms) errs.push('llms.txt non è allineato a scripts/istanbul-replies.mjs');
  // availableLanguage vive SOLO su ContactPoint e ServiceChannel (schema.org:
  // non è una proprietà di RealEstateAgent né di Service). Il canale del
  // servizio segue il config; il contactPoint dell'azienda (il numero di
  // Valentino, uguale su ogni pagina) resta ["en","it"].
  const langs = [...html.matchAll(/"availableLanguage":(\[[^\]]*\])/g)].map((m) => m[1]);
  const chan = [...html.matchAll(/"@type":"ServiceChannel"[^}]*?"availableLanguage":(\[[^\]]*\])/g)].map((m) => m[1]);
  const cp = [...html.matchAll(/"@type":"ContactPoint"[^}]*?"availableLanguage":(\[[^\]]*\])/g)].map((m) => m[1]);
  if (chan.length !== 1 || chan[0] !== JSON.stringify(RP.REPLIES.langs)) errs.push('ServiceChannel.availableLanguage ≠ config: ' + chan.join(' '));
  if (!cp.every((l) => l === '["en","it"]')) errs.push('il contactPoint dell\'azienda cambia lingua: ' + cp.join(' '));
  if (langs.length !== chan.length + cp.length) errs.push('availableLanguage fuori da ContactPoint/ServiceChannel');
  try { for (const n of ldNodes(html)) if ('availableLanguage' in n) errs.push('availableLanguage su ' + n['@type']); } catch { errs.push('JSON-LD illeggibile'); }
  if (!on) {
    if (langs.some((l) => l.includes('"tr"'))) errs.push('availableLanguage dichiara tr a interruttore spento');
    const strip = (t) => t.split(RP.REPLIES_OFF.llms).join(' ');
    const corpora = [['tr', visible(html, 'tr', { open: true })], ['en', visible(html, 'en', { open: true })], ['attr', attrsRead(html).join('\n')],
      ['ld', ldStrings(ldBlocks(html)).join('\n')], ['llms', strip(LLMS === llms ? llms : llms)]];
    for (const [k, t] of corpora) {
      const m = t.match(PROMISE_TR) || t.match(PROMISE_EN);
      if (m) errs.push(`${k}: promessa di risposte in turco «${m[0]}»`);
    }
  }
  return errs;
}
ok('la frase sulle risposte viene da scripts/istanbul-replies.mjs, e a interruttore spento nessuno promette risposte in turco', RP.TURKISH_REPLIES === false && !repliesErrors(HTML, LLMS).length, repliesErrors(HTML, LLMS));
{
  const n = (HTML.match(/<!--R:(tr|en)-->/g) || []).length;
  ok(`la frase vive in ${n / 2} punti della pagina (porta, FAQ, scheda) — tutti marcati`, n === 6);
  const on = RP.syncPage(HTML, RP.REPLIES_ON);
  ok('accendere l\'interruttore cambia porta, FAQ, FAQPage, scheda e il canale del servizio insieme (il contactPoint resta en/it)', (visible(on, 'tr', { open: true }).match(/Yazışma dili Türkçe, İngilizce ya da İtalyanca\./g) || []).length === 3
    && /"@type":"ServiceChannel"[^}]*"availableLanguage":\["tr","en","it"\]/.test(on) && /"@type":"ContactPoint"[^}]*"availableLanguage":\["en","it"\]/.test(on)
    && ldNodes(on).find((x) => x['@type'] === 'FAQPage').mainEntity[0].acceptedAnswer.text.startsWith('Yazışma dili Türkçe'));
  ok('…e la riga di llms.txt', RP.syncLlms(LLMS, RP.REPLIES_ON).includes(RP.REPLIES_ON.llms) && !RP.syncLlms(LLMS, RP.REPLIES_ON).includes('Turkish replies are not offered'));
  ok('la macchina non ha un ramo turco: api/_lang.js scrive solo it/en', !/'tr'/.test(read('api/_lang.js')));
}

// ── ogni frase con un fatto ha la sua fonte ──
// Una frase della pagina che contiene un numero o una parola di legge/carte
// deve contenere uno di questi frammenti; ogni frammento ha una fonte, e la
// fonte esterna deve essere un link in pagina (o un file del repo che esiste).
const FACTS = [
  { src: ['https://consistanbul.esteri.it/wp-content/uploads/2026/07/01_STUDIO-Immatricolazione-TR_CG-ISTANBUL-1.pdf', 'https://ambankara.esteri.it/wp-content/uploads/2026/07/01_STUDIO-Immatricolazione-TR.pdf'],
    tr: ['Vize bir adres ister', 'Otel de olur', 'dört belgeden birini kabul ediyor', 'İlk haftalar için otel rezervasyonu', 'İmzalı ve kayıtlı kira sözleşmesi', 'Seni evinde ağırlayacak kişinin konaklama taahhütnamesi ve kimlik fotokopisi', 'evi görmeden kiralamak zorunda değilsin', 'imzalı ve kayıtlı olmalı', 'İtalya İstanbul Başkonsolosluğu, 2026/27'],
    en: ['The visa asks for an address', 'A hotel will do', 'the consulate accepts one of these four', 'A hotel booking for the first weeks', 'A lease already signed and registered', "A host's declaration of accommodation", "you don't have to rent a home unseen", 'it must be signed and registered', 'Consulate in Istanbul, 2026/27'] },
  { src: ['https://brocardi.it/testo-unico-immigrazione/titolo-ii/capo-i/art5.html', 'https://www.uniroma1.it/it/pagina/permesso-di-soggiorno-motivi-di-studio'],
    tr: ['8 iş günü içinde oturma izni', 'D.Lgs. 286/1998, art. 5', 'için başvurman gerekir'], en: ['within 8 working days of entering Italy', 'D.Lgs. 286/1998, art. 5'] },
  { src: ['repo:terms.html'], why: 'BOOM non fa visti (Condizioni e politica: CLAUDE.md, piano della pagina)',
    tr: ['vize işlemlerini biz yapmayız', 'Vize ve oturma izni başvurularını sen yaparsın', 'Vize ve oturma izni başvurusu yapmaz', 'kira sözleşmesini hazırlar ve kaydettiririz'],
    en: ["we don't obtain visas", 'You file the visa and residence-permit applications', 'Does not file visa or permit applications', 'prepare the lease and have it registered'] },
  { src: ['https://www.agenziaentrate.gov.it/portale/documents/20143/5629825/Brochure+RLI.pdf'],
    tr: ['30 gün içinde İtalyan Gelir İdaresine', 'Agenzia delle Entrate (RLI)', 'kaydettirir'], en: ['within 30 days', 'Agenzia delle Entrate (RLI)', 'has it registered'] },
  { src: ['repo:terms.html'], why: 'Condizioni §3.1, §3.3, §4.1–4.3',
    tr: ['En az 3 ay', '3 aydan kısa', 'BOOM depozito tutmaz', 'Depozitoyu ev sahibi tutar', 'Yıllık kiranın %10\'u', 'Aylık kira 1.200', 'Tutar, ödemeden önce ön anlaşmada yazılıdır', 'Komisyon yıllık kiranın %10\'u + %22 KDV', '15 gün içinde yazılı kriterlerine uyan en az 3 ev', 'Kiralarsan komisyondan düşülür', '350 €', 'BOOM evlerini gezme ve başvuru', 'Şartlar §3', 'Şartlar §4'],
    en: ['3 months minimum', 'under 3 months', 'BOOM holds no deposits', 'The landlord holds it', "10% of a year's rent", 'With rent of €1,200', 'The amount is written in the pre-agreement', "Commission 10% of one year's rent + 22% VAT", 'At least 3 homes matching your written criteria within 15 days', 'Deducted from the commission if you rent', '€350', 'Viewings of BOOM homes and applications', 'Terms §3', 'Terms §4'] },
  { src: ['https://www.brocardi.it/legge-equo-canone/titolo-i/capo-i/art11.html'],
    tr: ['Depozito en fazla 3 aylık kira', 'en fazla üç aylık kira', 'L. 392/1978, art. 11'], en: ["Deposit at most 3 months' rent", "at most three months' rent", 'L. 392/1978, art. 11'] },
  { src: ['repo:reference/contratto_tipo_STUDENTI_Roma_2023.doc'],
    tr: ['Öğrencilere özel sözleşme', 'Roma\'ya özel öğrenci sözleşmesidir', 'aynı süre için kendiliğinden yenilenir'],
    en: ['A separate lease for students', "It is Rome's own student lease", 'At its first expiry it renews by itself'] },
  { src: ['https://www.uniroma4.it/index.php/how-to/finding-housing-in-rome/?lang=en', 'https://poliziadistato.it/articolo/pdf/201563bd3ae8aee9a742259146'],
    tr: ['Sözleşmesiz kiralamak seni korumasız bırakır', 'tam adresi iste', 'Her zaman resmî bir kira sözleşmesi imzala'],
    en: ['Renting without a contract leaves you unprotected', 'ask for the exact address', 'Always sign an official lease'] },
  { src: ['repo:api/_catalog.js'],
    tr: ['toplam 89 €', 'toplam 299 €', 'O evi BOOM\'la kiralarsan komisyondan düşülür', 'BOOM\'un bir evini kiralarsan komisyondan düşülür', 'Evlerimizi canlı videoda ücretsiz gezdiririz', 'başka bir ilan için canlı video gezisi'],
    en: ['€89 in total', '€299 in total', 'Deducted from the commission if you rent that home with BOOM', 'Deducted from the commission if you rent a BOOM home', 'We walk you through our homes on live video, free', 'live video tour of a home found elsewhere'] },
  { src: ['https://laziodisco.it/bando-diritto-allo-studio-2026-2027/faq-studenti-internazionali/', 'https://laziodisco.it/bando-diritto-allo-studio-2026-2027/faq-contratto-di-locazione-per-i-fuori-sede/'],
    tr: ['Ailenin en az yarısı yurt dışında yaşıyorsa', 'en az 10 aylık bedelli bir sözleşme', '2026/27 için 29 Kasım\'a kadar imza, 27 Aralık\'a kadar kayıt ve DiSCo\'ya bildirim', 'DiSCo, sözleşme'],
    en: ['If at least half of your household lives abroad', 'a paid lease of at least 10 months', 'for 2026/27, signed by 29 November; registered and reported to DiSCo by 27 December', 'DiSCo, leases'] },
  { src: ['https://ambankara.esteri.it/wp-content/uploads/2026/05/06_RESIDENZA-ELETTIVA_.pdf'],
    tr: ['İtalya\'nın Ankara Büyükelçiliği, başvurudan önce imzalanmış ve Gelir İdaresine kaydedilmiş'], en: ["Italy's embassy in Ankara asks for a lease signed and registered"] },
  { src: ['https://maps.google.com/?cid=15671179095441549815', 'repo:terms.html'], why: 'società, P.IVA, sede, marchio, valutazione Google',
    tr: ['IT17322991005', '17322991005', 'Via dei Coronari 181/184', 'Viale Liegi 42', 'RM-1710623', '019317594', '4,9', '© 2026 BOOM', 'Şirket merkezi'],
    en: ['IT17322991005', '17322991005', 'Via dei Coronari 181/184', 'Viale Liegi 42', 'RM-1710623', '019317594', '4.9', '© 2026 BOOM', 'Registered office'] },
];
const TRIGGER = /\d|\bvize|\bvisa|izin|permit|permesso|\byasa\b|\blaw\b|kayıt|kayda|kaydedil|kaydettir|regist|Agenzia|DiSCo|DSU|konsolosluk|consulate|Büyükelçili|embassy|depozito|deposit|polis|police|fuori sede/i;
// Una frase finisce a . ! ? — ma non dopo un'abbreviazione di legge o di
// società («art. 5», «md. 5 f. 2», «D.Lgs.», «L. 392», «S.r.l.»).
const ABBR = /(?:\bart|\bmd|\bf|D\.Lgs|\bL|S\.r\.l|\bn|\b[Nn]o)\.$/;
function sentences(line) {
  const parts = line.split(/(?<=[.!?])\s+(?=\p{Lu}|\d|«|“)|\s·\s/u).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) { if (out.length && ABBR.test(out[out.length - 1])) out[out.length - 1] += ' ' + p; else out.push(p); }
  return out;
}
// I paragrafi delle fonti (.src) sono citazioni, non affermazioni: si
// controlla a parte che ogni loro link sia una fonte della lista o una
// pagina nostra.
const withoutSrc = (html) => html.replace(/<p class="src">[\s\S]*?<\/p>/g, ' ');
function srcErrors(html) {
  const ok2 = new Set(FACTS.flatMap((f) => f.src));
  const errs = [];
  for (const m of html.matchAll(/<p class="src">([\s\S]*?)<\/p>/g)) {
    for (const a of m[1].matchAll(/href="([^"]+)"/g)) if (!a[1].startsWith('/') && !ok2.has(a[1])) errs.push('fonte non in lista: ' + a[1]);
  }
  return errs;
}
function factErrors(html) {
  const errs = [...srcErrors(html)];
  for (const lang of ['tr', 'en']) {
    const units = visible(withoutSrc(html), lang, { open: true, blocks: true }).flatMap(sentences);
    const snippets = FACTS.flatMap((f) => f[lang]);
    for (const u of units) {
      if (/\?$/.test(u) || !TRIGGER.test(u)) continue;                 // una domanda non afferma
      if (/^(Kaynaklar?|Sources):?$/.test(u)) continue;
      if (!snippets.some((s) => u.includes(s))) errs.push(`${lang}: «${u}»`);
    }
    for (const f of FACTS) for (const s of f[lang]) if (!visible(html, lang, { open: true }).includes(s)) errs.push(`${lang}: il frammento «${s}» non è più in pagina (lista vecchia)`);
  }
  for (const f of FACTS) for (const s of f.src) {
    if (s.startsWith('repo:')) { if (!fs.existsSync(path.join(R, s.slice(5)))) errs.push('fonte assente: ' + s); }
    else if (!html.includes(`href="${s}"`)) errs.push('fonte non linkata in pagina: ' + s);
  }
  return errs;
}
{
  const n = ['tr', 'en'].map((l) => visible(withoutSrc(HTML), l, { open: true, blocks: true }).flatMap(sentences).filter((u) => !/\?$/.test(u) && TRIGGER.test(u)).length);
  ok(`ogni frase con un numero o un fatto di carte/legge è nella lista dei fatti (${n[0]} frasi in turco, ${n[1]} in inglese), e ogni fonte è linkata`, n[0] >= 25 && n[1] >= 25 && !factErrors(HTML).length, factErrors(HTML));
}
{
  const t = visible(HTML, 'tr', { open: true }), e = visible(HTML, 'en', { open: true });
  ok('il fatto chiave: per il visto basta l\'otel delle prime settimane, una sözleşme mostrata va firmata e registrata', t.includes('İlk haftalar için otel rezervasyonu') && t.includes('Sözleşme gösterirsen, imzalı ve kayıtlı olmalı') && e.includes('A hotel booking for the first weeks'));
  ok('le parole del consolato in turco (konaklama taahhütnamesi di chi OSPITA — mai «ev sahibi», che qui è il locatore —, imzalı ve kayıtlı, üniversite yurdu)', /Seni evinde ağırlayacak kişinin konaklama taahhütnamesi/.test(t) && !/ev sahibinin kimlik/.test(t) && /İmzalı ve kayıtlı kira sözleşmesi/.test(t) && /Üniversite yurdu/.test(t));
  ok('nessuna promessa di visto: «vize işlemlerini biz yapmayız» e «vizenin çıkacağına söz vermez» in pagina', t.includes('vize işlemlerini biz yapmayız') && t.includes('vizenin çıkacağına söz vermez'));
  ok('i 89 € sono SOLO per un annuncio trovato altrove (le nostre case: gratis), ovunque — pagina, Kısaca, JSON-LD', !/(?<!başka bir ilan için )canlı video gezisi (?:toplam )?89/.test(t) && !/(?<!of a home found elsewhere )live video tour €89/.test(e)
    && /BOOM evlerini gezme ve başvuru/.test(t) && /Viewings of BOOM homes and applications/.test(e)
    && ldNodes(HTML).flatMap((n) => [].concat(n.offers || [])).filter((o) => o.price === '89').every((o) => /başka bir ilan/.test(o.name)));
  ok('i prezzi senza IVA dichiarata dicono che sono il totale (89 €, 299 €)', [...t.matchAll(/(?<!\d)(89|299) €/g)].every((m) => /toplam $/.test(t.slice(Math.max(0, m.index - 7), m.index))) && [...e.matchAll(/€(89|299)(?!\d)/g)].every((m) => /^ in total/.test(e.slice(m.index + m[0].length))));
  ok('le istituzioni sono ITALIANE, dette: consolato, ambasciata, polizia', /İtalya İstanbul Başkonsolosluğu/.test(t) && /İtalya Ankara Büyükelçiliği/.test(t) && /İtalya'nın Ankara Büyükelçiliği/.test(t) && /İtalyan polisinin önerisi/.test(t) && !/(?<!İtalyan )[Pp]olisin önerisi/.test(t));
  ok('DSU: la data del 27/12 è registrazione E comunicazione a DiSCo (altrimenti «pendolare calcolato»)', /27 Aralık'a kadar kayıt ve DiSCo'ya bildirim/.test(t) && /registered and reported to DiSCo by 27 December/.test(e));
}

// ── llms.txt ──
{
  const sec = istSection(LLMS);
  ok('llms.txt: la sezione İstanbul c\'è, linka /istanbul, cita 89/299/350 e il 10% con l\'IVA', !!sec && sec.includes('https://www.boomrome.com/istanbul') && /Virtual Viewing\]\([^)]*\) €89/.test(sec) && /Remote Move Pack\]\([^)]*\) €299/.test(sec) && /€350, VAT included/.test(sec) && /10% of one year's rent plus 22% VAT/.test(sec));
  ok('llms.txt: «## Optional» resta l\'ultima sezione', /\n## Optional\n[\s\S]*$/.test(LLMS) && !/\n## (?!Optional)[^\n]*\n(?![\s\S]*\n## Optional)/.test(LLMS.slice(LLMS.indexOf('## Optional'))));
}

// ════════════════════════════════════════════════════════════════════════
section('3 · mutazioni: le guardie mordono');
// ════════════════════════════════════════════════════════════════════════
{
  const m1 = RP.syncPage(HTML, RP.REPLIES_ON);
  ok('M1 · la pagina che promette risposte in turco a interruttore spento cade', repliesErrors(m1, LLMS).length > 0, repliesErrors(m1, LLMS));
  const m2 = HTML.replace('<p class="then"><span class="l-tr">Sözleşmesiz', '<p class="then"><span class="l-tr">Roma\'da yüzlerce Türk öğrenciye ev bulduk. Sözleşmesiz');
  ok('M2 · «yüzlerce Türk öğrenciye» cade (frase vietata e numero di persone)', m2 !== HTML && sayErrors(m2, LLMS).length > 0, sayErrors(m2, LLMS));
  const m2b = HTML.replace('<p class="then"><span class="l-tr">Sözleşmesiz', '<p class="then"><span class="l-tr">500 öğrenciye ev bulduk. Sözleşmesiz');
  ok('M2b · «500 öğrenciye» cade (numero di clienti)', m2b !== HTML && sayErrors(m2b, LLMS).some((x) => /numero di persone/.test(x)));
  const m3 = HTML.replace('Gidip senin için bakarız: <b>toplam 89&nbsp;€</b>', 'Gidip senin için bakarız: <b>toplam 79&nbsp;€</b>');
  ok('M3 · un prezzo diverso dal catalogo (79 € invece di 89 €) cade', m3 !== HTML && priceErrors(m3).length > 0, priceErrors(m3));
  const m3b = HTML.replace('<span class="l-tr">toplam 299&nbsp;€</span>', '<span class="l-tr">toplam 299&nbsp;€, KDV dahil</span>');
  ok('M3b · «KDV dahil» su un prezzo che il catalogo non dichiara IVA inclusa cade', m3b !== HTML && priceErrors(m3b).length > 0);
  const m4 = HTML.replace('<summary><span class="l-tr">Depozito ne kadar?</span>', '<summary><span class="l-tr">Depozito?</span>');
  ok('M4 · una domanda cambiata in pagina ma rimasta nel FAQPage cade', m4 !== HTML && checkLd(m4).some((x) => /FAQPage/.test(x)));
  const m5 = HTML.replace('<p class="then"><span class="l-tr">Sözleşmesiz', '<p class="then"><span class="l-tr">Vize 15 günde çıkar. Sözleşmesiz');
  ok('M5 · un fatto senza fonte («Vize 15 günde çıkar.») cade', m5 !== HTML && factErrors(m5).some((x) => /Vize 15 günde/.test(x)), factErrors(m5).slice(0, 2));
}
{
  // M6 · il server senza il ramo 409 del requestId: un ritentativo non è più
  // «duplicate». Una copia mutata accanto all'originale (gli import relativi
  // restano veri), cancellata nel finally.
  const src = read('api/leads/web.js');
  const mut = src.replace("if (e && e.exists && requestId) return res.status(200).json({ ok: true, id: `web_${formKey}_${requestId}`, duplicate: true });", '');
  const tmp = path.join(R, 'api/leads/__mutante_istanbul_web.js');
  let caught = false;
  try {
    if (mut === src) throw new Error('mutazione non applicata');
    fs.writeFileSync(tmp, mut);
    const M = await import('../../api/leads/__mutante_istanbul_web.js');
    const r1 = await post(M.default, base({ requestId: 'mutante000000001' }));
    const r2 = await post(M.default, base({ requestId: 'mutante000000001' }));
    caught = r1.statusCode === 200 && !(r2.statusCode === 200 && r2.body && r2.body.duplicate === true);
  } catch (e) { caught = /mutazione/.test(e.message) ? false : caught; }
  finally { try { fs.unlinkSync(tmp); } catch { /* già via */ } }
  ok('M6 · senza il ramo 409 il ritentativo non risponde più «duplicate»: la guardia del requestId lo vede', caught && !fs.existsSync(tmp));
}

// ════════════════════════════════════════════════════════════════════════
section('4 · il browser (Chromium a 390px)');
// ════════════════════════════════════════════════════════════════════════
const { loadChromium, launchOptions } = await import('../_browser.mjs');
const chromium = await loadChromium();
if (!chromium) {
  console.log('  SKIP: playwright non disponibile — la parte browser non gira');
} else {
  const srv = http.createServer((q, s) => {
    let u = decodeURIComponent(q.url.split('?')[0]);
    let f = path.join(R, u);
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
    s.setHeader('content-type', f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8');
    s.end(fs.readFileSync(f));
  }).listen(0);
  const port = srv.address().port;
  const br = await chromium.launch(launchOptions());
  try {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const bodies = [];
    let answer = 500, answerErr = 'write_failed';
    await ctx.route('**/api/leads/web', async (r) => {
      bodies.push(JSON.parse(r.request().postData() || '{}'));
      await new Promise((z) => setTimeout(z, 250));
      await r.fulfill({ status: answer, contentType: 'application/json', body: JSON.stringify(answer === 200 ? { ok: true, id: 'web_istanbul_x' } : { ok: false, error: answerErr }) });
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${port}/istanbul`);
    await p.waitForTimeout(600);
    const g = await p.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const lab = document.querySelector('label[for="fMonth"] .l-tr');
      return {
        sw: document.documentElement.scrollWidth, name: r('fName').top, go: r('fGo').bottom, dis: document.getElementById('fGo').disabled,
        label: lab.innerText, opts: [...document.getElementById('fMonth').options].map((o) => o.text), lang: document.documentElement.lang,
      };
    });
    ok(`390px: nessuno scorrimento laterale (${g.sw}px)`, g.sw <= 390);
    ok(`la porta intera nel primo schermo (nome a ${Math.round(g.name)}px, bottone fino a ${Math.round(g.go)}px su 844)`, g.name > 0 && g.go <= 844 && g.dis === false);
    ok('il maiuscolo turco: «NE ZAMAN GELİYORSUN?» (lang="tr": i→İ)', g.label === 'NE ZAMAN GELİYORSUN?', g.label);
    ok('i mesi in turco da tabella fissa, 18 + «Henüz belli değil»', g.opts.length === 20 && /^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık) \d{4}$/.test(g.opts[1]) && g.opts[19] === 'Henüz belli değil', g.opts.slice(0, 3));
    await p.evaluate(() => { window.__conv = 0; addEventListener('boom-conversion', () => { window.__conv++; }); });
    await p.fill('#fName', 'Elif Yılmaz');
    await p.fill('#fContact', '0532 123 45 67');
    await p.selectOption('#fMonth', { index: 9 });
    await p.fill('#fNote', 'Sapienza');
    await p.evaluate(() => { const b = document.getElementById('fGo'); b.click(); b.click(); document.getElementById('trForm').requestSubmit(); });
    await p.waitForTimeout(60);
    const busyNow = await p.evaluate(() => { const b = document.getElementById('fGo'); return { busy: b.getAttribute('aria-busy'), dis: b.disabled, label: b.innerText.trim() }; });
    ok('mentre il POST viaggia il bottone lo dice: «Gönderiliyor…», aria-busy, spento', busyNow.busy === 'true' && busyNow.dis && busyNow.label === 'Gönderiliyor…', busyNow);
    await p.waitForTimeout(640);
    const afterFail = await p.evaluate(() => { const e = document.getElementById('fErr'); return { err: e.textContent, on: e.classList.contains('on'), done: !document.getElementById('fDone').hidden, conv: window.__conv,
      nearGo: e.nextElementSibling && e.nextElementSibling.id === 'fGo', label: document.getElementById('fGo').innerText.trim(), busy: document.getElementById('fGo').getAttribute('aria-busy') }; });
    ok('tre tap = UN POST; un errore di rete lo dice sopra il bottone, che torna «Bize yaz», nessuna conversione', bodies.length === 1 && afterFail.on && /Gönderilemedi/.test(afterFail.err) && afterFail.nearGo && afterFail.label === 'Bize yaz' && afterFail.busy === null && !afterFail.done && afterFail.conv === 0, { posts: bodies.length, afterFail });
    // il server rifiuta il recapito: riprovare uguale non serve — si dice QUALE campo
    answer = 400; answerErr = 'contact_required';
    await p.click('#fGo');
    await p.waitForTimeout(700);
    const refused = await p.evaluate(() => { const e = document.getElementById('fErr'), c = document.getElementById('fContact');
      return { err: e.textContent, under: e.previousElementSibling === c, inv: c.getAttribute('aria-invalid'), desc: c.getAttribute('aria-describedby'), focus: document.activeElement.id }; });
    ok('400 contact_required dal server: il messaggio del recapito sotto il campo recapito, marcato e col focus (non «riprova»)', /WhatsApp numaranı ya da e-postanı yaz/.test(refused.err) && refused.under && refused.inv === 'true' && refused.desc === 'fErr' && refused.focus === 'fContact', refused);
    answerErr = 'write_failed';
    answer = 200;
    await p.click('#fGo');
    await p.waitForTimeout(700);
    const cleared = await p.evaluate(() => document.getElementById('fContact').getAttribute('aria-invalid'));
    ok('al nuovo invio il campo non resta marcato', cleared === null, cleared);
    const done = await p.evaluate(() => ({ form: document.getElementById('trForm').hidden, done: !document.getElementById('fDone').hidden, conv: window.__conv, focus: document.activeElement && document.activeElement.id }));
    const b0 = bodies[0] || {}, b1 = bodies[1] || {};
    const b2 = bodies[2] || {};
    ok('il ritentativo porta lo STESSO requestId (un lead lato server)', bodies.length === 3 && /^[0-9a-f]{16}$/.test(b0.requestId || '') && b0.requestId === b1.requestId && b1.requestId === b2.requestId, bodies.map((b) => b.requestId));
    ok('il corpo: form istanbul, nome, telefono, mese YYYY-MM, page_lang tr, honeypot vuoto', b1.form === 'istanbul' && b1.name === 'Elif Yılmaz' && b1.phone === '0532 123 45 67' && b1.email === '' && /^\d{4}-\d{2}$/.test(b1.move_in_date) && b1.page_lang === 'tr' && b1.company === '', b1);
    ok('dopo l\'ok: la porta diventa «Mesajın bize ulaştı», il focus ci va, UNA conversione', done.form && done.done && done.conv === 1 && done.focus === 'fDone', done);
    ok('nessun errore JS', !errs.length, errs);

    const p2 = await ctx.newPage();
    await p2.goto(`http://127.0.0.1:${port}/istanbul?lang=en`);
    await p2.waitForTimeout(400);
    const en = await p2.evaluate(() => ({ lang: document.documentElement.lang, h1: document.querySelector('h1').innerText.replace(/\s+/g, ' ').trim(), opt: document.getElementById('fMonth').options[1].text, pressed: document.getElementById('langEn').getAttribute('aria-pressed') }));
    ok('?lang=en: inglese (lang, H1, mesi), mai dedotto dal browser', en.lang === 'en' && en.h1 === 'A home in Rome. Choose it from Istanbul.' && /^[A-Z][a-z]+ \d{4}$/.test(en.opt) && en.pressed === 'true', en);
    bodies.length = 0;
    await p2.fill('#fName', 'Elif'); await p2.fill('#fContact', 'elif@example.com');
    await p2.click('#fGo'); await p2.waitForTimeout(600);
    ok('in inglese il server riceve page_lang en e l\'email nel campo email', bodies.length === 1 && bodies[0].page_lang === 'en' && bodies[0].email === 'elif@example.com' && bodies[0].phone === '', bodies[0]);
    await p2.click('#langTr'); await p2.waitForTimeout(200);
    ok('il tasto TR riporta il turco e toglie ?lang dall\'URL', await p2.evaluate(() => document.documentElement.lang === 'tr' && !/lang=/.test(location.search)));
    const p3 = await ctx.newPage();
    await p3.goto(`http://127.0.0.1:${port}/istanbul`);
    await p3.waitForTimeout(300);
    await p3.fill('#fName', 'E');
    await p3.click('#fGo'); await p3.waitForTimeout(450);   // il bordo ha una transizione di .3s
    const nm = await p3.evaluate(() => { const e = document.getElementById('fErr'), f = document.getElementById('fName'), a = f.getBoundingClientRect(), b = e.getBoundingClientRect();
      return { t: e.textContent, focus: document.activeElement.id, under: e.previousElementSibling === f, gap: Math.round(b.top - a.bottom), inv: f.getAttribute('aria-invalid'), desc: f.getAttribute('aria-describedby'), border: getComputedStyle(f).borderTopColor }; });
    ok('un nome mancante si dice in turco SOTTO il campo (≤ 12px), il campo è marcato (aria-invalid, aria-describedby, bordo rosso) e ha il focus', nm.t === 'Adını yaz.' && nm.focus === 'fName' && nm.under && nm.gap >= 0 && nm.gap <= 12 && nm.inv === 'true' && nm.desc === 'fErr' && nm.border === 'rgb(255, 122, 110)', nm);
    await p3.fill('#fName', 'Elif'); await p3.fill('#fContact', 'a@b@c.de');
    await p3.click('#fGo'); await p3.waitForTimeout(200);
    ok('un\'email che il server rifiuterebbe («a@b@c.de») si ferma in pagina, sotto il recapito', await p3.evaluate(() => /e-postanı/.test(document.getElementById('fErr').textContent) && document.getElementById('fErr').previousElementSibling.id === 'fContact' && document.getElementById('fName').getAttribute('aria-invalid') === null));
    await p3.click('#langEn'); await p3.waitForTimeout(150);
    ok('cambiando lingua l\'errore già in pagina cambia lingua', await p3.evaluate(() => document.getElementById('fErr').textContent === 'Write your WhatsApp number or email.'));

    // ── bersagli, contrasto, anello del focus ──
    const geo = await p3.evaluate(() => {
      const h = (q) => { const n = document.querySelector(q); const r = n.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
      return { tr: h('#langTr'), en: h('#langEn'), go: h('.nact .go'), brand: h('.brand'), trust: h('.trust a'), foot: [...document.querySelectorAll('footer .fcol a')].map((a) => Math.round(a.getBoundingClientRect().height)),
        over: getComputedStyle(document.querySelector('.lang')).overflow, src: getComputedStyle(document.querySelector('.src')).color, num: getComputedStyle(document.querySelector('.sec-h .num')).color };
    });
    ok('bersagli ≥ 44px: TR/EN, «Bize yaz» della nav, il marchio, il voto Google, i link del piede', geo.tr[0] >= 44 && geo.tr[1] >= 44 && geo.en[0] >= 44 && geo.en[1] >= 44 && geo.go[1] >= 44 && geo.brand[1] >= 44 && geo.trust[1] >= 44 && geo.foot.length >= 6 && geo.foot.every((x) => x >= 44), geo);
    ok('il grigio delle fonti e dei numeri a .5 (5,3:1), e la pillola TR/EN non taglia l\'anello del focus', geo.src === 'rgba(255, 255, 255, 0.5)' && geo.num === 'rgba(255, 255, 255, 0.5)' && geo.over === 'visible', geo);
    await ctx.close();

    // ── il piede a 320px in inglese: la nav sta in riga ──
    const c320 = await br.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
    await c320.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const q = await c320.newPage();
    await q.goto(`http://127.0.0.1:${port}/istanbul?lang=en`); await q.waitForTimeout(300);
    const n320 = await q.evaluate(() => { const b = document.querySelector('.brand').getBoundingClientRect(), l = document.querySelector('.lang').getBoundingClientRect(), g = document.querySelector('.nact .go').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, gap: Math.round(l.left - b.right), right: Math.round(g.right), sameRow: Math.abs(l.top - g.top) < 8 }; });
    ok(`320px in inglese: nessuno scorrimento laterale, marchio e lingua non si toccano (${n320.gap}px), la nav in riga`, n320.sw <= 320 && n320.gap >= 0 && n320.right <= 320 && n320.sameRow, n320);
    await c320.close();

    // ── il riquadro dei cookie non copre la porta ──
    const c2 = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await c2.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const plateOver = (pg) => pg.evaluate(() => {
      const el = document.querySelector('.boomcst');
      if (!el || el.classList.contains('zz') || getComputedStyle(el).visibility === 'hidden') return { shown: false, over: false };
      const a = el.getBoundingClientRect(), b = document.getElementById('fGo').getBoundingClientRect();
      return { shown: true, over: a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right };
    });
    const k = await c2.newPage();
    await k.goto(`http://127.0.0.1:${port}/istanbul`);
    await k.waitForTimeout(6200);
    const idle = await plateOver(k);
    ok('390×844, sei secondi fermi sul primo schermo: il riquadro dei cookie non sta sopra «Bize yaz»', !idle.over, idle);
    await k.mouse.wheel(0, 1400); await k.waitForTimeout(1600);
    const away = await plateOver(k);
    ok('scorsa via la porta, il riquadro arriva (non resta nascosto per sempre)', away.shown && await k.evaluate(() => /Kabul et/.test(document.querySelector('.boomcst').innerText)), away);
    ok('piede: «Çerez tercihleri» in turco, alto ≥ 26px (era un link vuoto da 6px)', await k.evaluate(() => { const a = document.querySelector('[data-cookie-prefs]'); return !!a && a.innerText.trim() === 'Çerez tercihleri' && a.getBoundingClientRect().height >= 26; }));
    await k.click('#langEn'); await k.waitForTimeout(150);
    ok('il riquadro cambia lingua con l\'interruttore (boomConsent.relabel)', await k.evaluate(() => { const p = document.querySelector('.boomcst'); return /Accept turns on Google Analytics/.test(p.innerText) && p.getAttribute('aria-label') === 'Cookie preferences' && document.querySelector('[data-cookie-prefs]').innerText.trim() === 'Cookie preferences'; }));
    await c2.close();

    // chi sta scrivendo nel modulo non riceve il riquadro sopra il bottone, nemmeno dopo i 45 s
    const c3 = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await c3.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const w = await c3.newPage();
    await w.clock.install();
    await w.goto(`http://127.0.0.1:${port}/istanbul`);
    await w.clock.runFor(1200);
    await w.focus('#fContact'); await w.keyboard.type('05');
    await w.clock.runFor(60000);
    const typing = await plateOver(w);
    ok('dopo 60 s col cursore nel modulo il riquadro aspetta ancora', !typing.shown, typing);
    await w.evaluate(() => document.activeElement.blur());
    await w.clock.runFor(3000);
    const after = await plateOver(w);
    ok('uscito dal campo, oltre i 45 s il riquadro arriva', after.shown, after);
    await c3.close();
  } finally { await br.close(); srv.close(); }
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}İstanbul → Roma: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
