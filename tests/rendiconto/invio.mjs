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
//  - lo stato che non si riesce a scrivere (403, 503, risposta persa) =
//    NESSUNA email: senza stato il giro dopo la rimanderebbe;
//  - il tempo finito prima dello stato = rimandato senza doc; dopo lo
//    stato = `failed` col motivo «tempo», e il giro dopo lo riprende;
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

// ═══ 5. Lo stato non si scrive: l'email NON parte, e lo si DICE ══════════
// (revisione del 13/10: prima un errore qualsiasi sulla creazione dello
// stato — un 503 momentaneo — mandava l'email senza stato, e il giro dopo la
// rimandava: due rendiconti dello stesso mese.)
{
  seed();
  globalThis.__fsHook = (method, path) => (method === 'POST' && path === 'rendiconti' ? new Response('{"error":{"code":403}}', { status: 403 }) : null);
  const r = await drive({ ownerId: 'ownA' });
  const res = r.body.results[0];
  check('create 403 sullo stato: NESSUNA email, «non partito» col motivo (mai in silenzio)',
    r.body.counts.sent === 0 && r.body.counts.failed === 1 && to('A').length === 0 && /stato d'invio non si è potuto scrivere \(Firestore 403\)/.test(res.failed) && res.stateHttp === 403);
  check('…Telegram dice che le regole rifiutano lo stato, e il battito è rosso',
    F.telegrams.some((t) => /rifiutato dalle regole Firestore/.test(t) && /Non partito: Proprietaria A/.test(t)) && F.store.get('teamHealth/rendiconto').ok === false);
}
{
  // Un 503 momentaneo, poi un secondo giro: UNA sola email.
  seed();
  let once = true;
  globalThis.__fsHook = (method, path) => (method === 'POST' && path === 'rendiconti' && once ? (once = false, new Response('{"error":{"code":503,"status":"UNAVAILABLE"}}', { status: 503 })) : null);
  const r1 = await drive({ ownerId: 'ownA' });
  check('503 sullo stato: non partito, nessuno stato, nessuna email', r1.body.counts.failed === 1 && !doc('A') && to('A').length === 0);
  const r2 = await drive({ ownerId: 'ownA' });
  check('…il giro dopo lo manda: una email in tutto, stato sent', r2.body.counts.sent === 1 && to('A').length === 1 && doc('A').status === 'sent');
  const r3 = await drive({ ownerId: 'ownA' });
  check('…e il terzo giro non lo rimanda', r3.body.counts.alreadySent === 1 && to('A').length === 1);
}
{
  // La creazione RIUSCITA la cui risposta si è persa: il doc c'è (sending,
  // fase building), la risposta dice errore. Niente email; il giro subito
  // dopo vede un giro «in corso»; quando il sending invecchia si riprende.
  seed();
  let once = true;
  globalThis.__fsHook = (method, path, opts) => {
    if (method !== 'POST' || path !== 'rendiconti' || !once) return null;
    once = false;
    F.put(`rendiconti/ownA_${MONTH}`, { ownerId: 'ownA', month: MONTH, status: 'sending', phase: 'building', mode: 'auto', startedAt: new Date().toISOString(), attempts: 1 });
    return new Response('upstream reset', { status: 502 });
  };
  const r1 = await drive({ ownerId: 'ownA' });
  check('risposta persa sulla creazione: nessuna email', r1.body.counts.failed === 1 && to('A').length === 0 && doc('A').status === 'sending');
  const r2 = await drive({ ownerId: 'ownA' });
  check('…il giro subito dopo: in corso, nessuna email', r2.body.counts.inProgress === 1 && to('A').length === 0);
  F.put(`rendiconti/ownA_${MONTH}`, { ...doc('A'), startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() });
  const r3 = await drive({ ownerId: 'ownA' });
  check('…invecchiato (fase building: l\'email non era partita) si riprende: una email', r3.body.counts.sent === 1 && to('A').length === 1 && doc('A').attempts === 2);
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
// Un orologio finto: le email «costano» il tempo che diciamo (vedi anche
// tests/rendiconto/tempo.mjs). EMAIL_MS qui è 150: la soglia prima dello
// stato è 150 + 5000, quella prima delle letture 6000.
const vBudget = (total) => { let t = 0; return { tick: (ms) => { t += ms; }, left: () => Math.max(0, total - t), afford: (c) => t + Math.max(0, c || 0) <= total }; };
const contractsOf = (opts, pid) => {
  try { const sq = JSON.parse(opts.body).structuredQuery; const v = sq.where.fieldFilter.value; return sq.from[0].collectionId === 'contracts' && v.arrayValue.values.some((x) => x.stringValue === pid); }
  catch { return false; }
};
{
  // Le letture di B sono lente: dopo, il tempo per l'email non c'è più.
  // Rimandato PRIMA dello stato: nessun doc scritto per lui.
  seed();
  const b = vBudget(20000);
  globalThis.__mailHook = () => { b.tick(10000); };
  globalThis.__fsHook = (method, path, opts) => { if (path === ':runQuery' && contractsOf(opts, 'pB')) b.tick(6000); return null; };
  const out = await mod.run({ monthOverride: MONTH, budget: b, now: new Date('2026-08-03T06:10:00Z') });
  check('tempo finito dopo il primo: il secondo è «rimandato», nessuno stato scritto per lui',
    out.counts.sent === 1 && out.counts.deferred === 1 && out.results.some((x) => x.ownerId === 'ownB' && x.skipped === 'deferred' && !x.after) && !doc('B') && to('B').length === 0);
  check('Telegram dice di rilanciare «Esegui ora» (il cron mensile non riprova da solo)', F.telegrams.some((t) => /1 rimandati per tempo: rilancia «Esegui ora» nella Squadra/.test(t)));
  globalThis.__mailHook = null; globalThis.__fsHook = null;
  const r = await drive();
  check('il giro dopo fa il rimandato, non il già inviato', r.body.counts.sent === 1 && r.body.counts.alreadySent === 1 && to('A').length === 1 && to('B').length === 1);
}
{
  // Il tempo è finito prima ancora di leggere B: rimandato senza letture.
  seed();
  const b = vBudget(20000);
  globalThis.__mailHook = () => { b.tick(15500); };
  const out = await mod.run({ monthOverride: MONTH, budget: b, now: new Date('2026-08-03T06:10:00Z') });
  const readB = F.queries.some((q) => q.filter && Array.isArray(q.filter.value) && q.filter.value.includes('pB'));
  check('senza tempo per le letture: rimandato, B nemmeno letto', out.counts.sent === 1 && out.counts.deferred === 1 && !readB && !doc('B'));
  globalThis.__mailHook = null;
}
{
  // Il tempo finisce DOPO lo stato (la scrittura dello stato di B è lenta):
  // B resta `failed` col motivo «tempo», nessuna email; il giro dopo lo fa.
  seed();
  const b = vBudget(30000);
  globalThis.__mailHook = () => { b.tick(10000); };
  globalThis.__fsHook = (method, path) => { if (method === 'POST' && path === 'rendiconti' && doc('A') && doc('A').status === 'sent') b.tick(18000); return null; };
  const out = await mod.run({ monthOverride: MONTH, budget: b, now: new Date('2026-08-03T06:10:00Z') });
  check('tempo finito dopo lo stato: B failed col motivo «tempo», rimandato, nessuna email',
    out.counts.sent === 1 && out.counts.deferred === 1 && doc('B').status === 'failed' && /^tempo/.test(doc('B').error) && to('B').length === 0
    && out.results.some((x) => x.ownerId === 'ownB' && x.skipped === 'deferred' && x.after === 'stato'));
  globalThis.__mailHook = null; globalThis.__fsHook = null;
  const r = await drive();
  check('…il giro dopo riprende B (secondo tentativo), A non riceve un doppione',
    r.body.counts.sent === 1 && doc('B').status === 'sent' && doc('B').attempts === 2 && to('A').length === 1 && to('B').length === 1);
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
