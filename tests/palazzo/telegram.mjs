// tests/palazzo/telegram.mjs — /palazzo su Telegram.
// Il modulo VERO (api/telegram/_palazzo.js) su un Firestore in memoria che
// risponde a :runQuery come quello vero (filtri EQUAL/IN, limit). Le regole:
// stesso motore della pagina, letture limitate al palazzo, mai un recapito
// degli inquilini nel messaggio.
// Uso: node tests/palazzo/telegram.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFixture } from './fixture.mjs';

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';

let count = 0;
const check = async (name, fn) => { await fn(); count++; console.log('✓ ' + name); };

const NOW = new Date();
const F = buildFixture(NOW);
const store = { properties: F.state.properties, contracts: F.state.contracts, payments: F.state.payments, preAgreements: F.state.preAgreements };
const usersById = Object.fromEntries(F.state.users.map(u => [u.id, u]));
const queries = [];
const okJson = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const fromFs = v => v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue)
  : v.arrayValue ? (v.arrayValue.values || []).map(fromFs) : v.booleanValue !== undefined ? v.booleanValue : null;

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit') || url.includes('securetoken')) return okJson({ idToken: 'svc', localId: 'svc', expiresIn: '3600' });
  if (url.includes(':batchGet')) {
    const docs = JSON.parse(opts.body).documents || [];
    return okJson(docs.map(n => { const id = n.split('/').pop(), u = usersById[id];
      if (!u) return { missing: n };
      const { id: _i, ...rest } = u; const fields = {}; for (const [k, v] of Object.entries(rest)) fields[k] = toFs(v);
      return { found: { name: n, fields, updateTime: '2026-01-01T00:00:00Z' } }; }));
  }
  if (url.endsWith(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery;
    const coll = q.from[0].collectionId, ff = q.where && q.where.fieldFilter;
    queries.push({ coll, filter: ff ? ff.field.fieldPath + ' ' + ff.op : '' });
    let docs = (store[coll] || []).slice();
    if (ff) {
      const want = fromFs(ff.value), f = ff.field.fieldPath;
      docs = docs.filter(d => ff.op === 'IN' ? want.includes(d[f]) : ff.op === 'EQUAL' ? d[f] === want : true);
    }
    docs = docs.slice(0, q.limit || 50);
    return okJson(docs.map(d => { const { id, ...rest } = d; const fields = {}; for (const [k, v] of Object.entries(rest)) fields[k] = toFs(v); return { document: { name: 'projects/test-proj/databases/(default)/documents/' + coll + '/' + id, fields } }; }));
  }
  throw new Error('rete inattesa: ' + url);
};

const { palazzoMessage } = await import('../../api/telegram/_palazzo.js');

await check('/palazzo: i palazzi con almeno 3 interni (Via Altra, 2 interni, resta fuori)', async () => {
  const { msg, keyboard } = await palazzoMessage('', { now: NOW });
  assert.ok(msg.includes('🏛 <b>Viale Esempio 12</b> · Proprietaria Demo') && !msg.includes('Via Altra'), msg);
  assert.equal(keyboard.inline_keyboard[0][0].url, 'https://www.boomrome.com/portal#palazzo');
});
await check('il mese dallo STESSO motore della pagina: la frase, chi non ha pagato, scadenze, registrazioni', async () => {
  const { msg } = await palazzoMessage('', { now: NOW });
  assert.ok(msg.includes('10 interni su 13 sono pieni, 1 libero, 2 in arrivo.'), msg);
  assert.ok(/🔴 <b>Non hanno pagato<\/b>\n• int\. 12 · Inquilino 12 Demo · €800 · \d+ giorni\n• int\. 3 · Inquilino 3 Demo · €1\.000/.test(msg), msg);
  assert.ok(/⌛ <b>In scadenza entro 90 giorni<\/b>\n• int\. 7 · tra 60 giorni/.test(msg), msg);
  assert.ok(msg.includes('📄 <b>Registrazione da segnare</b> (oltre 30 giorni dalla decorrenza): int. 5, int. 8'), msg);
  assert.ok(/🧰 Da sistemare nel portal: \d+ voci\./.test(msg), msg);
});
await check('mai un recapito degli inquilini nel messaggio (per chiamare c\'è la scheda)', async () => {
  const { msg } = await palazzoMessage('', { now: NOW });
  assert.ok(!msg.includes('+39') && !msg.includes('@'), msg);
});
await check('letture limitate al palazzo: contratti e rate solo con un filtro sui SUOI interni', async () => {
  queries.length = 0;
  await palazzoMessage('', { now: NOW });
  const scoped = queries.filter(q => q.coll !== 'properties');
  assert.ok(scoped.length >= 3 && scoped.every(q => / IN$/.test(q.filter)), JSON.stringify(queries));
  assert.ok(scoped.some(q => q.filter === 'contractId IN'), 'una rata senza propertyId si ritrova dal contratto');
});
await check('/palazzo <via>: solo quel palazzo; testo sconosciuto lo dice', async () => {
  const one = await palazzoMessage('altra', { now: NOW });
  assert.ok(one.msg.includes('Via Altra 3') && !one.msg.includes('Viale Esempio'), one.msg);
  const none = await palazzoMessage('via <inesistente>', { now: NOW });
  assert.ok(none.msg.startsWith('Nessun palazzo il cui indirizzo contiene «via &lt;inesistente&gt;»'), none.msg);
});
await check('giunzioni: il webhook lo serve e lo elenca in /help', async () => {
  const wh = readFileSync(new URL('../../api/telegram/webhook.js', import.meta.url), 'utf8');
  assert.ok(wh.includes("import { palazzoMessage } from './_palazzo.js';"));
  assert.ok(/if \(text === '\/palazzo' \|\| text\.startsWith\('\/palazzo '\)\)/.test(wh));
  assert.ok(wh.includes("'• /palazzo — "));
});

console.log(`\n${count} check — /palazzo su Telegram, modulo vero su Firestore in memoria.`);
