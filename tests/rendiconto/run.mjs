// tests/rendiconto/run.mjs — il rendiconto proprietario, blindato.
// Handler REALE (api/owners/rendiconto.js), pdf-lib REALE, nodemailer
// mockato (loader della suite), Firestore/Storage/Telegram in memoria
// (tests/rendiconto/_fake.mjs: filtri IN, pagine, precondizioni vere).
// LE REGOLE: solo il mese giusto entra nei numeri, il PDF vero viaggia in
// allegato al proprietario, un rerun NON rispedisce (idempotenza per
// proprietario+mese), dry non scrive né spedisce, chi non ha email viene
// segnalato e mai perso in silenzio. Dal 12/10/2026 anche: la rata scaduta
// del mese chiuso È un arretrato (prima il rendiconto diceva «nessun
// arretrato» con un inquilino che non aveva pagato).
// Le altre suite: palazzo.mjs (la presa in carico, anteprima/automatico,
// coerenza col Palazzo), invio.mjs (l'invio che non si perde), letture.mjs
// (letture mirate), wa.mjs (nomi non latini), tempo.mjs (il tempo del giro e
// la promessa del recap), revisione.mjs (arretrati senza importo, la rata
// trimestrale che copre il mese), mutazioni.mjs.
// Uso: node tests/rendiconto/run.mjs
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.CRON_SECRET = 'cron-test-secret';
process.env.GMAIL_USER = 'sistema@example.invalid';
process.env.GMAIL_APP_PASS = 'x';
process.env.ADMIN_NOTIFY_EMAIL = 'operatore@example.invalid';
delete process.env.TELEGRAM_BOT_TOKEN; // tgNotify si spegne da solo

const F = await import('./_fake.mjs');
F.install();
let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const mails = () => globalThis.__mails || [];
const { store, storageFiles } = F;

// ── Dati: un proprietario, due immobili, un mese vero di movimenti ──────
const MONTH = '2026-07';
function seed() {
  F.reset();
  F.put('users/own1', { role: 'landlord', name: 'Stefano Prova', email: 'stefano@example.invalid' });
  F.put('properties/p1', { ownerId: 'own1', address: 'Via Finta 36', name: 'Finta trentasei' });
  F.put('properties/p2', { ownerId: 'own1', address: 'Via Inventata 7', name: 'Inventata sette' });
  F.put('properties/px', { ownerId: 'own2', address: 'Via Vuota 1', name: 'SenzaMovimenti' });
  F.put('users/own2', { role: 'landlord', name: 'Vuoto', email: 'vuoto@example.invalid' });
  F.put('contracts/c1', { propertyId: 'p1', tenantName: 'Giulia Prova', landlordName: 'Stefano Prova', rent: 1400, status: 'active' });
  F.put('contracts/c2', { propertyId: 'p2', tenantName: 'Marco Prova', landlordName: 'Stefano Prova', rent: 900, status: 'active' });
  // pagata NEL mese (conta), pagata in ALTRO mese (non conta), scaduta del mese, arretrato vecchio
  F.put('payments/pay_c1_2026-07', { contractId: 'c1', propertyId: 'p1', amount: 1400, month: '2026-07', dueDate: '2026-07-01', status: 'paid', paidDate: '2026-07-03', paidVia: 'bank' });
  F.put('payments/pay_c1_2026-06', { contractId: 'c1', propertyId: 'p1', amount: 1400, month: '2026-06', dueDate: '2026-06-01', status: 'paid', paidDate: '2026-06-02', paidVia: 'stripe' });
  F.put('payments/pay_c2_2026-07', { contractId: 'c2', propertyId: 'p2', amount: 900, month: '2026-07', dueDate: '2026-07-05', status: 'pending' });
  F.put('payments/pay_c2_2026-05', { contractId: 'c2', propertyId: 'p2', amount: 900, month: '2026-05', dueDate: '2026-05-05', status: 'pending' });
  // Uno stato che il motore non sa leggere (una contestazione): «in verifica», mai arretrato, mai taciuto.
  F.put('payments/pay_c2_2026-06', { contractId: 'c2', propertyId: 'p2', amount: 900, month: '2026-06', dueDate: '2026-06-05', status: 'disputed' });
  F.put('maintenance/m1', { propertyId: 'p1', title: 'Caldaia rumorosa', status: 'resolved', createdAt: '2026-07-10T09:00:00Z', resolvedAt: '2026-07-12T09:00:00Z' });
}
const mkRes = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const handler = (await import('../../api/owners/rendiconto.js')).default;
const drive = async (query = {}, authz = 'Bearer cron-test-secret') => {
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: authz }, query, body: {} }, res);
  return res;
};

// ═══ 1. Auth ════════════════════════════════════════════════════════════
{
  seed();
  const r = await drive({ month: MONTH }, 'Bearer sbagliato');
  check('auth: secret sbagliato → 401', r.code === 401);
}

// ═══ 2. Happy path ══════════════════════════════════════════════════════
{
  seed();
  const r = await drive({ month: MONTH });
  check('cron: 200 con counts', r.code === 200 && r.body.ok === true && r.body.month === MONTH);
  check('1 rendiconto inviato, 1 proprietario senza movimenti saltato', r.body.counts.sent === 1 && r.body.counts.skippedNoActivity === 1);

  const own = r.body.results.find(x => x.ownerId === 'own1');
  // Arretrati 1800 = maggio (900) + LUGLIO (900): la rata del mese chiuso,
  // scaduta il 05/07 e non pagata, È un arretrato. Il vecchio codice la
  // metteva fra le «in attesa» e diceva 900.
  check('numeri del mese giusti: incassato 1400 (NON 2800), atteso 2300, arretrati 1800 (luglio compreso)',
    own && own.collected === 1400 && own.expected === 2300 && own.arrears === 1800);
  check('modalità: senza interni presi in carico → automatica, al proprietario', own.mode === 'auto' && own.deliverTo === 'owner');

  const stored = storageFiles.get(`rendiconti/own1/rendiconto_${MONTH}.pdf`);
  check('PDF su Storage (magic %PDF)', !!stored && stored.slice(0, 4).toString() === '%PDF' && stored.length > 1500);

  const m = mails().find(x => x.to === 'stefano@example.invalid');
  check('email al proprietario (IT) con PDF identico allo Storage',
    !!m && /Rendiconto di Luglio 2026/.test(m.subject) && m.attachments && Buffer.compare(m.attachments[0].content, stored) === 0);
  const doc = store.get(`rendiconti/own1_${MONTH}`);
  check('stato del mese scritto DOPO l\'invio: sent, al proprietario', !!doc && doc.status === 'sent' && doc.mode === 'auto' && doc.to === 'stefano@example.invalid');
  check('nessuna email al proprietario senza movimenti', !mails().some(x => x.to === 'vuoto@example.invalid'));

  const txt = await F.pdfText(stored);
  check('PDF: una sezione per immobile, ognuna col suo nome', /Finta trentasei/.test(txt) && /Inventata sette/.test(txt));
  check('PDF: la rata scaduta del mese chiuso è NON PAGATA, in rosso, non «in attesa»', /Rata di luglio 2026 · NON PAGATA, scaduta il 05\/07\/2026/.test(txt) && !/in attesa/.test(txt));
  check('PDF: l\'arretrato vecchio ha il suo mese a parole', /Arretrato: rata di maggio 2026, scaduta il 05\/05\/2026/.test(txt));
  check('PDF: il canale in italiano (mai «bank»)', /pagata il 03\/07\/2026 · bonifico/.test(txt) && !/\(bank\)|\bbank\b/.test(txt));
  check('PDF: euro all\'italiana deterministici', /€1\.400/.test(txt) && /€2\.300/.test(txt) && /€1\.800/.test(txt));
  check('PDF: la manutenzione del mese c\'è', /Manutenzione: Caldaia rumorosa — risolta il 12\/07\/2026/.test(txt));
  check('PDF: uno stato sconosciuto è «in verifica da BOOM», non un arretrato', /In verifica da BOOM: rata di giugno 2026/.test(txt) && !/Arretrato: rata di giugno/.test(txt));
  const html = String(m.html);
  check('email: niente «Nessun arretrato» quando qualcuno non ha pagato', !/Nessun arretrato/.test(html) && /Non hanno pagato la rata di luglio 2026/.test(html));
  check('email: niente «ci stiamo già lavorando» senza un sollecito registrato', !/ci stiamo già lavorando/.test(html));

  // ═══ 3. Rerun = nessun doppio invio ═══
  const before = mails().length;
  const r2 = await drive({ month: MONTH });
  check('rerun: already_sent, zero nuove email', r2.body.counts.alreadySent === 1 && r2.body.counts.sent === 0 && mails().length === before);
}

// ═══ 4. Dry run ═════════════════════════════════════════════════════════
{
  seed();
  const r = await drive({ month: MONTH, dry: '1' });
  const own = r.body.results.find(x => x.ownerId === 'own1');
  check('dry: calcola i numeri ma non scrive né spedisce',
    r.code === 200 && own.collected === 1400 && own.arrears === 1800 && mails().length === 0 && storageFiles.size === 0 && !store.has(`rendiconti/own1_${MONTH}`));
  check('dry: dice a chi andrebbe e cosa c\'è dentro', own.deliverTo === 'owner' && own.to === 'stefano@example.invalid' && Array.isArray(own.units) && own.units.length === 2 && Array.isArray(own.brief));
}

// ═══ 5. Proprietario senza email ════════════════════════════════════════
{
  seed();
  F.put('users/own1', { role: 'landlord', name: 'Stefano' }); // niente email, niente landlords/
  F.put('contracts/c1', { propertyId: 'p1', tenantName: 'Giulia', rent: 1400, status: 'active' }); // niente landlordEmail
  F.put('contracts/c2', { propertyId: 'p2', tenantName: 'Marco', rent: 900, status: 'active' });
  const r = await drive({ month: MONTH });
  check('senza email: segnalato nel recap, mai perso in silenzio',
    r.body.counts.skippedNoEmail === 1 && r.body.results.some(x => x.skipped === 'no_email') && mails().length === 0);
  check('senza email: nessuno stato d\'invio scritto (il mese resta da mandare)', !store.has(`rendiconti/own1_${MONTH}`));
}

console.log(`\nRendiconto: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
