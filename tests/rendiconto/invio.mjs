// tests/rendiconto/invio.mjs — il rendiconto che non si perde (lacuna 2
// dell'audit del 12/10/2026) e la porta (chi può lanciarlo).
//
// Prima il segnaposto `rendiconti/<owner>_<mese>` nasceva PRIMA dell'invio:
// un guasto di Gmail lasciava il mese «già inviato» per sempre, e fermava
// anche i proprietari dopo. LE REGOLE:
//  - lo stato diventa `sent` solo DOPO l'invio riuscito;
//  - un errore certo lascia `failed` col motivo e il giro dopo riprova;
//  - un timeout (l'email può essere partita) lascia `uncertain` e NON si
//    ritenta da solo: ci vuole ?force=1;
//  - un proprietario che fallisce non ferma gli altri;
//  - Storage giù non ferma l'email (il PDF viaggia in allegato);
//  - un 'sending' fresco è un giro in corso, uno vecchio si riprende (o è
//    incerto se stava già spedendo); un doc del vecchio codice è un invio fatto;
//  - un proprietario col suo token non lancia il rendiconto di tutti; force e
//    preview solo da cron o admin.
// Uso: node tests/rendiconto/invio.mjs
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k'; process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c'; process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj'; process.env.CRON_SECRET = 'cron-test-secret'; process.env.HOMIE_SECRET = 'homie-test-secret';
process.env.GMAIL_USER = 'sistema@example.invalid'; process.env.GMAIL_APP_PASS = 'x';
process.env.ADMIN_NOTIFY_EMAIL = 'operatore@example.invalid';
process.env.TELEGRAM_BOT_TOKEN = 'tg-test'; process.env.TELEGRAM_CHAT_ID = '1';
process.env.RENDICONTO_EMAIL_MS = '150';   // il tetto dell'invio, corto per provare l'esito incerto

const F = await import('./_fake.mjs');
F.install({ tokens: { 'tok-admin': 'adm', 'tok-landlord': 'ownA' } });
let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const mails = () => globalThis.__mails || [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MONTH = '2026-07';
function seed() {
  F.reset();
  F.put('users/adm', { role: 'admin', name: 'Operatore', email: 'operatore@example.invalid' });
  for (const o of ['A', 'B']) {
    F.put(`users/own${o}`, { role: 'landlord', name: `Proprietaria ${o}`, email: `own${o.toLowerCase()}@example.invalid` });
    F.put(`properties/p${o}`, { ownerId: `own${o}`, address: `Via Finta ${o === 'A' ? 1 : 2}`, name: `Casa ${o}` });
    F.put(`contracts/c${o}`, { propertyId: `p${o}`, tenantName: `Inquilino ${o}`, rent: 1000, status: 'active' });
    F.put(`payments/pay_c${o}_2026-07`, { contractId: `c${o}`, propertyId: `p${o}`, amount: 1000, month: '2026-07', dueDate: '2026-07-05', status: 'paid', paidDate: '2026-07-04', paidVia: 'bonifico' });
  }
}
const mkRes = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const mod = await import('../../api/owners/rendiconto.js');
const drive = async (query = {}, headers = { authorization: 'Bearer cron-test-secret' }) => {
  const res = mkRes(); await mod.default({ method: 'POST', headers, query: { month: MONTH, ...query }, body: {} }, res); return res;
};
const doc = (o) => F.store.get(`rendiconti/own${o}_${MONTH}`);
const to = (o) => mails().filter((m) => m.to === `own${o.toLowerCase()}@example.invalid`);

// ═══ 1. Un guasto certo: failed col motivo, gli altri partono ════════════
{
  seed();
  globalThis.__mailHook = (m) => { if (m.to === 'owna@example.invalid') { const e = new Error('smtp down'); e.code = 'EAUTH'; throw e; } };
  const r = await drive();
  check('il giro risponde 200 anche con un proprietario in errore', r.code === 200 && r.body.counts.failed === 1 && r.body.counts.sent === 1);
  check('A: stato failed col motivo, MAI sent', doc('A').status === 'failed' && /smtp down/.test(doc('A').error) && doc('A').attempts === 1);
  check('B: partito lo stesso (un guasto non ferma gli altri)', doc('B').status === 'sent' && to('B').length === 1 && to('A').length === 0);
  check('il battito dice che qualcosa non è partito', F.store.get('teamHealth/rendiconto').ok === false);
  check('Telegram: il proprietario non partito, col motivo', F.telegrams.some((t) => /Non partito: Proprietaria A — email: smtp down/.test(t)));

  globalThis.__mailHook = null;
  const r2 = await drive();
  check('il giro dopo RIPROVA A (e B non riceve un doppione)', r2.body.counts.sent === 1 && r2.body.counts.alreadySent === 1 && to('A').length === 1 && to('B').length === 1);
  check('A ora sent, al secondo tentativo', doc('A').status === 'sent' && doc('A').attempts === 2 && doc('A').error == null);
  check('il battito torna verde', F.store.get('teamHealth/rendiconto').ok === true);
}

// ═══ 2. Un timeout: esito incerto, parcheggiato, force per rimandare ════
{
  seed();
  // L'email parte DAVVERO, ma la risposta arriva dopo il tetto: incerto.
  globalThis.__mailHook = async (m) => { if (m.to === 'owna@example.invalid') await sleep(400); };
  const r = await drive();
  check('timeout dell\'invio: incerto, non «failed» e non «sent»', r.body.counts.uncertain === 1 && doc('A').status === 'uncertain' && /email_timeout/.test(doc('A').error));
  await sleep(450);
  check('(l\'email era partita comunque)', to('A').length === 1);
  globalThis.__mailHook = null;
  const r2 = await drive();
  check('il giro dopo NON la ritenta da solo (un doppio rendiconto si evita)', r2.body.counts.parked === 1 && to('A').length === 1 && r2.body.results.find((x) => x.ownerId === 'ownA').skipped === 'uncertain');
  const r3 = await drive({ force: '1', ownerId: 'ownA' });
  check('?force=1 (cron): rimanda, e lo stato torna sent', r3.body.counts.sent === 1 && to('A').length === 2 && doc('A').status === 'sent');
}

// ═══ 3. Storage giù: l'email parte comunque col PDF in allegato ══════════
{
  seed();
  globalThis.__storageHook = (name) => (name && name.startsWith('rendiconti/ownA') ? new Response('denied', { status: 403 }) : null);
  const r = await drive();
  const res = r.body.results.find((x) => x.ownerId === 'ownA');
  const m = to('A')[0];
  check('Storage 403: l\'email parte lo stesso, col PDF in allegato', !!m && m.attachments && m.attachments[0].content.slice(0, 4).toString() === '%PDF');
  check('…senza il bottone verso un file che non c\'è', !/Apri il rendiconto/i.test(String(m.html)));
  check('…e il guasto è scritto nel risultato, lo stato è sent', /Storage upload failed \(403\)/.test(res.storageWarn) && doc('A').status === 'sent' && doc('A').url == null);
}

// ═══ 4. I 'sending': in corso, morto prima dell'email, morto durante ═════
{
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  seed();
  F.put(`rendiconti/ownA_${MONTH}`, { ownerId: 'ownA', month: MONTH, status: 'sending', phase: 'building', mode: 'auto', startedAt: new Date().toISOString(), attempts: 1 });
  let r = await drive({ ownerId: 'ownA' });
  check('sending fresco: un altro giro è in corso, niente email', r.body.counts.inProgress === 1 && to('A').length === 0);
  seed();
  F.put(`rendiconti/ownA_${MONTH}`, { ownerId: 'ownA', month: MONTH, status: 'sending', phase: 'building', mode: 'auto', startedAt: old, attempts: 1 });
  r = await drive({ ownerId: 'ownA' });
  check('sending vecchio, morto PRIMA dell\'email: si riprende e parte', r.body.counts.sent === 1 && to('A').length === 1 && doc('A').status === 'sent' && doc('A').attempts === 2);
  seed();
  F.put(`rendiconti/ownA_${MONTH}`, { ownerId: 'ownA', month: MONTH, status: 'sending', phase: 'emailing', mode: 'auto', startedAt: old, attempts: 1 });
  r = await drive({ ownerId: 'ownA' });
  check('sending vecchio, morto DURANTE l\'email: incerto, niente email', r.body.counts.parked === 1 && to('A').length === 0 && doc('A').status === 'uncertain');
  seed();
  F.put(`rendiconti/ownA_${MONTH}`, { ownerId: 'ownA', month: MONTH, at: '2026-08-01T06:10:00Z' });
  r = await drive({ ownerId: 'ownA' });
  check('doc del vecchio codice (senza stato): è un invio fatto, non si rispedisce', r.body.counts.alreadySent === 1 && to('A').length === 0);
}

// ═══ 5. Regole non deployate: si procede e si DICE ═══════════════════════
{
  seed();
  globalThis.__fsHook = (method, path) => (method === 'POST' && path === 'rendiconti' ? new Response('{"error":{"code":403}}', { status: 403 }) : null);
  const r = await drive({ ownerId: 'ownA' });
  const res = r.body.results[0];
  check('create 403 sullo stato: l\'invio parte (mai un mese saltato in silenzio) e lo dice', r.body.counts.sent === 1 && /403/.test(res.idemWarn) && F.telegrams.some((t) => /stato d'invio non scritto/.test(t)));
}

// ═══ 6. Un proprietario che fallisce nelle LETTURE non ferma gli altri ═══
{
  seed();
  globalThis.__fsHook = (method, path, opts) => {
    if (path !== ':runQuery') return null;
    const sq = JSON.parse(opts.body).structuredQuery;
    const v = sq.where && sq.where.fieldFilter && sq.where.fieldFilter.value;
    const vals = v && v.arrayValue ? v.arrayValue.values.map((x) => x.stringValue) : [];
    return sq.from[0].collectionId === 'contracts' && vals.includes('pA') ? new Response('boom', { status: 500 }) : null;
  };
  const r = await drive();
  check('letture di A in errore: A failed (nessuno stato scritto: il giro dopo riparte), B inviato',
    r.body.counts.failed === 1 && !doc('A') && to('B').length === 1 && /letture: Firestore list failed \(500\)/.test(r.body.results.find((x) => x.ownerId === 'ownA').failed));
}

// ═══ 7. Il tempo che manca: rimandati, detti, mai persi ═══════════════════
{
  seed();
  let calls = 0;
  const out = await mod.run({ monthOverride: MONTH, budget: { afford: () => calls++ === 0 } });
  check('budget finito dopo il primo: il secondo è «rimandato», nessuno stato scritto per lui',
    out.counts.sent === 1 && out.counts.deferred === 1 && out.results.some((x) => x.skipped === 'deferred') && !doc('B'));
  check('Telegram dice di rilanciare', F.telegrams.some((t) => /1 rimandati per tempo: rilancia/.test(t)));
  const r = await drive();
  check('il giro dopo fa il rimandato, non il già inviato', r.body.counts.sent === 1 && r.body.counts.alreadySent === 1 && to('A').length === 1 && to('B').length === 1);
}

// ═══ 8. La porta ════════════════════════════════════════════════════════
{
  seed();
  let r = await drive({}, { authorization: 'Bearer tok-landlord' });
  check('un proprietario col suo token: 403, niente numeri né email di altri', r.code === 403 && r.body.error === 'admin_required' && mails().length === 0 && !r.body.results);
  r = await drive({ force: '1' }, { 'x-homie-secret': 'homie-test-secret' });
  check('force da Homie: 403 (solo cron o admin)', r.code === 403 && mails().length === 0);
  r = await drive({ preview: '1' }, { 'x-homie-secret': 'homie-test-secret' });
  check('preview da Homie: 403', r.code === 403 && mails().length === 0);
  r = await drive({ dry: '1' }, { 'x-homie-secret': 'homie-test-secret' });
  check('un giro normale da Homie resta possibile', r.code === 200 && r.body.dry === true);
  r = await drive({}, { authorization: 'Bearer tok-admin' });
  check('un admin: 200 e i rendiconti partono', r.code === 200 && r.body.counts.sent === 2);
  r = await drive({ force: '1', ownerId: 'ownB' }, { authorization: 'Bearer tok-admin' });
  check('un admin con force: rimanda quel proprietario', r.code === 200 && r.body.counts.sent === 1 && to('B').length === 2);
}

console.log(`\nRendiconto · invio: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
