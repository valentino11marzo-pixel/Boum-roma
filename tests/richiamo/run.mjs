// tests/richiamo/run.mjs — IL RICHIAMO: un ordine, una campagna, un tap.
//
// I modi in cui questo strumento può tradire l'operatore, in ordine di danno:
//   · scrivere a chi NON va disturbato (un inquilino, uno che ha già una
//     visita, uno richiamato ieri) — parte dal SUO numero, brucia la fiducia;
//   · inviare DUE volte (un secondo tap, un retry) — molestia certificata;
//   · un'esclusione silenziosa — indistinguibile da un bug.
// Quindi: veti per mutazione, idempotenza sul handler VERO, e il giro
// completo fino al postino (wa-outbox REALE che pull-a i messaggi della
// campagna) e alle email (nodemailer mockato via loader).
//
// Esegui: node tests/richiamo/run.mjs

import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.HOMIE_SECRET = 'test-secret';
process.env.WIZARD_SECRET = 'test-secret';
process.env.GMAIL_USER = 'boom@test.it';
process.env.GMAIL_APP_PASS = 'x';
process.env.TELEGRAM_BOT_TOKEN = 'tok';
process.env.TELEGRAM_CHAT_ID = '5538';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

const NOW = Date.now();
const days = n => new Date(NOW - n * 86400000).toISOString();

// ── Firestore in memoria + cattura Telegram ────────────────────────────────
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
    TG.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
    return json({ ok: true, result: { message_id: TG.length } });
  }
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (u.includes(':runQuery')) {
    const coll = body.structuredQuery.from[0].collectionId;
    const filter = body.structuredQuery.where && body.structuredQuery.where.fieldFilter;
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

const R = await import('../../api/leads/_richiamo.js');
const { default: handler } = await import('../../api/leads/richiamo.js');
const { default: outbox } = await import('../../api/homie/wa-outbox.js');
const { handleRichiamaCommand } = await import('../../api/telegram/_richiamo.js');

const mails = () => globalThis.__mails || [];
const countIn = coll => [...DB.keys()].filter(k => k.startsWith(coll + '/')).length;

// ── 1. i veti, uno per uno (ogni esclusione dice perché) ───────────────────
{
  const base = { id: 'l', phone: '+393330001111', email: '', status: 'new', createdAt: days(3) };
  ok('lead pulito passa', R.vetoRichiamo({ ...base }) === null);
  ok('morto → veto', /morto/.test(R.vetoRichiamo({ ...base, grade: 'dead' }) || ''));
  ok('archiviato → veto', /archiviato/.test(R.vetoRichiamo({ ...base, status: 'archived' }) || ''));
  ok('già inquilino → veto', /inquilino/.test(R.vetoRichiamo({ ...base, status: 'won' }) || ''));
  ok('non cerca più → veto', /non cerca/.test(R.vetoRichiamo({ ...base, status: 'lost', lostReason: 'not_looking' }) || ''));
  ok('senza recapito → veto', /recapito/.test(R.vetoRichiamo({ ...base, phone: '', email: '' }) || ''));
  ok('oltre 120 giorni → veto', /120/.test(R.vetoRichiamo({ ...base, createdAt: days(200) }) || ''));
  const excl = new Set(['+393330001111']);
  ok('contatto BOOM (set telefoni) → veto', /contatto BOOM/.test(R.vetoRichiamo({ ...base }, { excludePhones: excl }) || ''));
  ok('…e aggancia anche la forma NAZIONALE', /contatto BOOM/.test(
    R.vetoRichiamo({ ...base, phone: '3330001111' }, { excludePhones: excl }) || ''));
  const booked = new Set(['+393330001111']);
  ok('visita già in agenda → veto', /visita/.test(R.vetoRichiamo({ ...base }, { upcomingViewingPhones: booked }) || ''));
  ok('richiamato 2gg fa → cooldown', /cooldown/.test(R.vetoRichiamo({ ...base, lastOutreachAt: days(2) }) || ''));
  ok('richiamato 10gg fa → passa', R.vetoRichiamo({ ...base, lastRichiamoAt: days(10) }) === null);
}

// ── 2. canale e messaggi ───────────────────────────────────────────────────
{
  ok('col numero → whatsapp', R.channelFor({ phone: '+393331234567' }) === 'whatsapp');
  ok('solo email → email', R.channelFor({ email: 'a@b.com' }) === 'email');
  ok('niente → null', R.channelFor({}) === null);
  const listing = { id: 'casa1', name: 'Trilocale Pigneto', zone: 'Pigneto', price: 1400 };
  const it = R.interestedText({ name: 'Marco Rossi' }, listing, 'it');
  const en = R.interestedText({ name: 'Sophie K' }, listing, 'en');
  ok('interessato IT: nomina la casa e porta il link di prenotazione',
    /Marco/.test(it) && /Trilocale Pigneto/.test(it) && it.includes('/book?listing=casa1'));
  ok('interessato EN nella lingua giusta', /Hi Sophie/.test(en) && en.includes('/book?listing=casa1'));
  ok('recente IT porta al catalogo', R.recentText({ name: 'Anna' }, 'it').includes('/apartments'));
}

// ── 3. la campagna pura: interessati + affini, esclusi col motivo ──────────
{
  const listing = { id: 'casa1', name: 'Trilocale Pigneto', zone: 'Pigneto', price: 1400, beds: 2 };
  const leads = [
    { id: 'int1', propertyId: 'casa1', phone: '+393330000001', name: 'Marco', message: 'vorrei visitare il trilocale', status: 'new', createdAt: days(5) },
    { id: 'int2', propertyId: 'casa1', email: 'sophie@x.com', name: 'Sophie', message: 'Hello, is it available?', status: 'new', createdAt: days(4) },
    { id: 'dead1', propertyId: 'casa1', phone: '+393330000009', grade: 'dead', status: 'new', createdAt: days(3) },
    { id: 'aff1', propertyId: 'casa2', phone: '+393330000002', name: 'Louis', message: 'looking for a two bedroom in Pigneto under 1500', status: 'new', createdAt: days(6) },
  ];
  const byId = new Map([['casa2', { id: 'casa2', name: 'Bilocale Trastevere', zone: 'Trastevere', price: 1600 }]]);
  const c = R.buildCampaign({ type: 'listing', listing, leads, listingById: byId, knownZones: ['Pigneto', 'Trastevere'], now: NOW });
  ok('interessati dentro (wa + email)', c.counts.interessati === 2 && c.counts.whatsapp >= 1 && c.counts.email >= 1, c.counts);
  ok('l\'affine che cercava così entra con il SUO messaggio',
    c.rows.some(r => r.leadId === 'aff1' && r.kind === 'affine' && /Pigneto/.test(r.text)), c.rows.map(r => r.kind));
  ok('il morto è escluso E dice perché', c.excluded.some(e => e.id === 'dead1' && /morto/.test(e.reason)));
  ok('nessuno compare due volte', new Set(c.rows.map(r => r.leadId)).size === c.rows.length);
  const tg = R.tgCampaignText(c);
  ok('anteprima: numeri, esempio ed esclusi', /RICHIAMO/.test(tg) && /Esempio/.test(tg) && /Esclusi/.test(tg));
}

// ── 4. il giro VERO: prepare → tap → postino → email ──────────────────────
DB.set('listings/casa1', { name: 'Trilocale Pigneto', zone: 'Pigneto', price: 1400, beds: 2 });
DB.set('listings/casa3', { name: 'Trilocale Prati', zone: 'Prati', price: 1800, beds: 2 });
DB.set('leads/int1', { propertyId: 'casa1', phone: '+393330000001', name: 'Marco', message: 'vorrei visitare il trilocale', status: 'new', createdAt: days(5) });
DB.set('leads/int2', { propertyId: 'casa1', email: 'sophie@x.com', name: 'Sophie', message: 'Hello, is the flat available?', status: 'new', createdAt: days(4) });
DB.set('leads/ten1', { propertyId: 'casa1', phone: '+393330000003', name: 'Inquilino', status: 'new', createdAt: days(2) });
DB.set('leads/boo1', { propertyId: 'casa1', phone: '+393330000004', name: 'Prenotato', status: 'new', createdAt: days(2) });
DB.set('leads/rec1', { phone: '+393330000007', name: 'Recente', message: 'cerco casa a roma', status: 'new', createdAt: days(2) });
DB.set('users/u1', { phone: '3330000003', role: 'tenant' });
DB.set('viewings/v1', { phone: '+393330000004', status: 'confirmed', when: new Date(NOW + 2 * 86400000).toISOString() });

const call = (method, body, headers = {}) => new Promise(resolve => {
  const req = { method, headers: { 'x-wizard-secret': 'test-secret', ...headers }, body, query: body && body.__q ? body.__q : {} };
  const res = {
    _status: 0, _h: {},
    setHeader(k, v) { this._h[k] = v; },
    status(c) { this._status = c; return this; },
    json(o) { resolve({ status: this._status, body: o }); },
    end() { resolve({ status: this._status || 204, body: null }); },
  };
  handler(req, res);
});

{
  const before = countIn('richiamoCampaigns');
  const r = await call('POST', { op: 'prepare', listingId: 'casa1' }, { 'x-wizard-secret': 'wrong', 'x-homie-secret': 'wrong' });
  ok('segreto sbagliato → 401', r.status === 401);
  ok('…e nessuna campagna creata', countIn('richiamoCampaigns') === before);
}

let campId;
{
  const r = await call('POST', { op: 'prepare', listingId: 'casa1' });
  ok('prepare ok', r.status === 200 && r.body.ok === true, r.body);
  campId = r.body.id;
  const c = r.body.campaign;
  ok('Marco e Sophie dentro', c.counts.interessati === 2, c.counts);
  ok('l\'inquilino è escluso (forma nazionale nel set)', c.excluded.some(e => /contatto BOOM/.test(e.reason)), c.excluded);
  ok('chi ha già la visita è escluso', c.excluded.some(e => /visita/.test(e.reason)), c.excluded);
  const card = TG.find(t => t.url.includes('sendMessage') && t.body && /RICHIAMO/.test(t.body.text || ''));
  ok('card Telegram con la firma a un tap', !!card && JSON.stringify(card.body.reply_markup || {}).includes('rk:' + campId));
  const cb = card && card.body.reply_markup.inline_keyboard[0][0].callback_data;
  ok('callback ≤64 byte', !!cb && Buffer.byteLength(cb) <= 64, cb);
  const stored = DB.get('richiamoCampaigns/' + campId);
  ok('campagna persistita pending', stored && stored.status === 'pending');
}

{
  const r = await call('POST', { op: 'send', id: campId });
  ok('send ok', r.status === 200 && r.body.ok === true, r.body);
  ok('1 WhatsApp in coda + 1 email partita', r.body.wa === 1 && r.body.email === 1, r.body);
  ok('email a Sophie, personale, con la casa nel soggetto',
    mails().some(m => m.to === 'sophie@x.com' && /Trilocale Pigneto/.test(m.subject)), mails().map(m => m.to));
  ok('il lead richiamato porta il cooldown', !!(DB.get('leads/int1') || {}).lastRichiamoAt);

  // il postino VERO pull-a il messaggio della campagna
  const pull = await new Promise(resolve => {
    outbox({ method: 'POST', headers: { 'x-homie-secret': 'test-secret' }, body: { op: 'pull' } },
      { status(c) { this._s = c; return this; }, json(o) { resolve(o); } });
  });
  ok('wa-outbox consegna il messaggio di Marco col link prenotazione',
    pull.ok && pull.messages.some(m => m.phone === '+393330000001' && m.text.includes('/book?listing=casa1')), pull.messages);

  // idempotenza: il secondo tap non rimanda niente
  const waBefore = countIn('action_queue'), mailBefore = mails().length;
  const r2 = await call('POST', { op: 'send', id: campId });
  ok('secondo invio → 409, MAI un doppio', r2.status === 409 && countIn('action_queue') === waBefore && mails().length === mailBefore, r2.body);
}

// ── 5. recenti + cancel, e il cooldown appena nato che protegge ────────────
{
  const r = await call('POST', { op: 'prepare', audience: 'recenti', days: 7 });
  ok('recenti: solo chi è davvero senza seguito', r.body.ok && r.body.campaign.counts.total === 1 &&
    r.body.campaign.rows[0].leadId === 'rec1', r.body.campaign && r.body.campaign.counts);
  ok('Marco (richiamato or ora) è escluso per cooldown',
    r.body.campaign.excluded.some(e => /cooldown/.test(e.reason)), r.body.campaign.excluded);
  const rc = await call('POST', { op: 'cancel', id: r.body.id });
  ok('cancel su pending', rc.status === 200 && rc.body.ok === true);
  const rs = await call('POST', { op: 'send', id: r.body.id });
  ok('send dopo cancel → 409', rs.status === 409);
}

// ── 6. il comando: mai un tiro a indovinare sulla casa ─────────────────────
{
  const before = countIn('richiamoCampaigns');
  TG.length = 0;
  await handleRichiamaCommand('5538', 'trilocale');
  ok('nome ambiguo → si elencano le opzioni, NESSUNA campagna',
    countIn('richiamoCampaigns') === before && TG.some(t => /corrisponde a 2/.test((t.body || {}).text || '')),
    TG.map(t => (t.body || {}).text && t.body.text.slice(0, 40)));
  await handleRichiamaCommand('5538', 'Pigneto');
  ok('nome univoco → campagna preparata', countIn('richiamoCampaigns') === before + 1);
  await handleRichiamaCommand('5538', 'villa inesistente');
  ok('nessun match → lo dice, non inventa', TG.some(t => /Nessuna casa trovata/.test((t.body || {}).text || '')));
}

console.log(fails ? `\n${fails} test falliti` : '\nTutti i test passano');
process.exit(fails ? 1 : 0);
