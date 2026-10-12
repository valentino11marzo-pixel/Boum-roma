// tests/rendiconto/letture.mjs — letture MIRATE (lacuna 1 dell'audit).
//
// Prima: 400 immobili, 800 contratti, 3000 rate, 600 manutenzioni, SENZA
// ordine. Firestore restituisce per nome documento: oltre il tetto le rate
// di un palazzo sparivano e il rendiconto diceva il falso senza saperlo.
// LE REGOLE: gli immobili si leggono tutti (a pagine); contratti, rate e
// manutenzioni di un proprietario si leggono con IN sui SUOI interni (e le
// rate anche per contratto, quando non portano l'immobile); nessuna lettura
// di rate senza filtro.
// Uso: node tests/rendiconto/letture.mjs
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k'; process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c'; process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj'; process.env.CRON_SECRET = 'cron-test-secret';
process.env.GMAIL_USER = 'sistema@example.invalid'; process.env.GMAIL_APP_PASS = 'x';
delete process.env.TELEGRAM_BOT_TOKEN;

const F = await import('./_fake.mjs');
F.install();
let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const mails = () => globalThis.__mails || [];
const MONTH = '2026-07';
const pad = (n) => String(n).padStart(5, '0');

function seed() {
  F.reset();
  // Un archivio grande che viene PRIMA, per nome, del palazzo che conta.
  for (let i = 0; i < 900; i++) F.put(`properties/a${pad(i)}`, { address: `Via Altra ${i}`, name: `Altro ${i}` });
  for (let i = 0; i < 900; i++) F.put(`contracts/a${pad(i)}`, { propertyId: `a${pad(i)}`, tenantName: `Altro ${i}`, rent: 500, status: 'active' });
  for (let i = 0; i < 3500; i++) F.put(`payments/a${pad(i)}`, { contractId: `a${pad(i % 900)}`, propertyId: `a${pad(i % 900)}`, amount: 500, month: MONTH, dueDate: MONTH + '-05', status: 'pending' });
  for (let i = 0; i < 700; i++) F.put(`maintenance/a${pad(i)}`, { propertyId: `a${pad(i % 900)}`, title: 'Altro', status: 'open', createdAt: MONTH + '-02' });
  // Il palazzo della proprietaria: per nome, DOPO tutti i tetti di prima.
  F.put('users/ownz', { role: 'landlord', name: 'Zelda Prova', email: 'zelda@example.invalid' });
  F.put('properties/zz1', { ownerId: 'ownz', address: 'Via Ultima 9', interno: '1', name: 'Ultima int. 1' });
  F.put('properties/zz2', { ownerId: 'ownz', address: 'Via Ultima 9', interno: '2', name: 'Ultima int. 2' });
  F.put('contracts/zz1', { propertyId: 'zz1', tenantName: 'Uno Prova', rent: 1200, status: 'active' });
  F.put('contracts/zz2', { propertyId: 'zz2', tenantName: 'Due Prova', rent: 1300, status: 'active' });
  F.put('payments/zz1_07', { contractId: 'zz1', propertyId: 'zz1', amount: 1200, month: MONTH, dueDate: MONTH + '-05', status: 'paid', paidDate: MONTH + '-04', paidVia: 'bonifico' });
  // Una rata SENZA immobile: si ritrova dal contratto, come fa il motore.
  F.put('payments/zz2_07', { contractId: 'zz2', amount: 1300, month: MONTH, dueDate: MONTH + '-05', status: 'pending' });
  F.put('maintenance/zz_m1', { propertyId: 'zz2', title: 'Perdita al bagno', status: 'open', createdAt: MONTH + '-15' });
}
const mkRes = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const handler = (await import('../../api/owners/rendiconto.js')).default;
const drive = async (query = {}) => { const res = mkRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer cron-test-secret' }, query: { month: MONTH, ...query }, body: {} }, res); return res; };

{
  seed();
  const r = await drive();
  const res = r.body.results.find((x) => x.ownerId === 'ownz') || {};
  check('la proprietaria oltre i 400 immobili è trovata (gli immobili si leggono a pagine)', r.body.counts.owners === 1 && !!res.ownerId);
  check('numeri giusti: pagata 1200, dovuto 2500, arretrati 1300 (la rata senza immobile, ritrovata dal contratto)',
    res.collected === 1200 && res.expected === 2500 && res.arrears === 1300);
  check('il rendiconto parte', mails().length === 1 && mails()[0].to === 'zelda@example.invalid');
  const txt = await F.pdfText(mails()[0].attachments[0].content);
  check('nel PDF: i suoi due interni, la manutenzione aperta, niente degli altri', /Int\. 1/.test(txt) && /Int\. 2/.test(txt) && /Perdita al bagno — aperta/.test(txt) && !/Altro \d/.test(txt));
  const pq = F.queries.filter((q) => q.col === 'payments');
  check('nessuna lettura di rate senza filtro (mai più il tetto delle 3000)', pq.length > 0 && pq.every((q) => q.filter && q.filter.op === 'IN'));
  check('rate per immobile E per contratto', pq.some((q) => q.filter.field === 'propertyId' && q.filter.value.includes('zz1')) && pq.some((q) => q.filter.field === 'contractId' && q.filter.value.includes('zz2')));
  check('contratti e manutenzioni per IN sui suoi interni', ['contracts', 'maintenance'].every((c) => F.queries.filter((q) => q.col === c).every((q) => q.filter && q.filter.op === 'IN' && q.filter.value.every((v) => v.startsWith('zz')))));
  check('gli immobili: più pagine, tutti letti', F.queries.filter((q) => q.col === 'properties').length >= 2);
}
{
  seed();
  F.queries.length = 0;
  await drive({ ownerId: 'ownz', dry: '1' });
  const pq = F.queries.filter((q) => q.col === 'properties');
  check('?ownerId: gli immobili si leggono filtrati per proprietario', pq.length === 1 && pq[0].filter && pq[0].filter.field === 'ownerId' && pq[0].filter.op === 'EQUAL');
}
{
  // Un IN ha un tetto di 30 valori: 70 interni → tre blocchi, nessuno perso.
  F.reset();
  F.put('users/ownm', { role: 'landlord', name: 'Molti Prova', email: 'molti@example.invalid' });
  for (let i = 0; i < 70; i++) {
    F.put(`properties/m${pad(i)}`, { ownerId: 'ownm', address: 'Via Lunga 1', interno: String(i + 1) });
    F.put(`contracts/m${pad(i)}`, { propertyId: `m${pad(i)}`, tenantName: `Inquilino ${i}`, rent: 100, status: 'active' });
    F.put(`payments/m${pad(i)}`, { contractId: `m${pad(i)}`, propertyId: `m${pad(i)}`, amount: 100, month: MONTH, dueDate: MONTH + '-05', status: 'paid', paidDate: MONTH + '-03' });
  }
  const r = await drive({ dry: '1' });
  const res = r.body.results[0];
  check('70 interni: blocchi IN da 30, tutti contati (7000 pagati)', res.collected === 7000 && res.properties === 70
    && F.queries.filter((q) => q.col === 'contracts').every((q) => q.filter.value.length <= 30));
}

console.log(`\nRendiconto · letture: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
