// tests/rendiconto/palazzo.mjs — il rendiconto di un palazzo PRESO IN CARICO.
//
// I dati nascono dal motore vero della presa in carico (parseRentRoll +
// planImport), come per la prima cliente: cinque interni, due «contratto da
// caricare», oneri fissi nella rata, un locatore società diverso dalla
// persona dell'account, un bonifico segnalato. Date RELATIVE a oggi: il mese
// del rendiconto è sempre il mese scorso. Nomi, telefoni, email inventati.
// LE REGOLE (audit del 12/10/2026, rilievi 7, 18, 33, 34):
//  - chi ha interni presi in carico riceve l'ANTEPRIMA all'operatore, mai
//    la proprietaria, finché qualcuno non la mette su «automatico»;
//  - i numeri sono quelli della pagina del Palazzo (stesso motore);
//  - la rata scaduta del mese È un arretrato, un bonifico segnalato NO;
//  - ogni interno ha il suo titolo, il contratto da caricare non ha €0;
//  - canone e oneri separati, il canale in parole, il locatore società detto.
// Uso: node tests/rendiconto/palazzo.mjs
import { register, createRequire } from 'node:module';
register('./loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k'; process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c'; process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj'; process.env.CRON_SECRET = 'cron-test-secret';
process.env.GMAIL_USER = 'sistema@example.invalid'; process.env.GMAIL_APP_PASS = 'x';
process.env.ADMIN_NOTIFY_EMAIL = 'operatore@example.invalid';
delete process.env.TELEGRAM_BOT_TOKEN;

const F = await import('./_fake.mjs');
F.install();
const require = createRequire(import.meta.url);
const P = require('../../js/palazzo-engine.js');
const RENT = require('../../js/rent-engine.js');

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const mails = () => globalThis.__mails || [];

const NOW = new Date();
const CUR = P.day(NOW).slice(0, 7), M = P.monthAdd(CUR, -1), M0 = P.monthAdd(M, -1), END = P.monthAdd(M0, 11);
const d = (m, dd) => `${dd}/${m.slice(5)}/${m.slice(0, 4)}`;
const MESE = P.monthLabel(M).toLowerCase(), MESE0 = P.monthLabel(M0).toLowerCase();
const ROLL = [
  'Interno;Piano;Inquilino;Co-intestatari;Telefono;Email;Canone;Oneri;Dal;Al;Tipo;Deposito;Cedolare;Registrato il;Pagato il;Locatore;IBAN;Mq',
  `7;3;Şule Örnek;Mehmet Prova;+39 000 000 0001;sule@example.invalid;1500;120;${d(M0, 15)};${d(END, 14)};studenti;3000;no;;;Prova Immobiliare S.r.l.;IT60X0542811101000000123456;70`,
  `11;;Иван Тестов;Olga Prova;+39 000 000 0002;;1600;;${d(M0, '01')};${d(END, 28)};studenti;3200;no;;;Prova Immobiliare S.r.l.;;`,
  `13;2;Emre Prova;;+39 000 000 0003;;1550;120;${d(M0, '01')};${d(END, 28)};studenti;;no;;;Prova Immobiliare S.r.l.;;`,
  '14;;Pavel Prova;;;;;;;;;;;;;;',
  '5;2;Sergio Prova;Anna Prova;;;;;;;;;;;;;',
].join('\n');

function seed({ mode, gd = M0, userName = 'Chiara Prova' } = {}) {
  F.reset();
  const R = P.parseRentRoll(ROLL);
  if (R.rows.some((r) => r.errors.length)) throw new Error('tabella di prova sbagliata: ' + JSON.stringify(R.rows.map((r) => r.errors)));
  const plan = P.planImport(R.rows, P.context({ properties: [], now: NOW }), { address: 'Piazzale Finto 42, Roma', ownerId: 'own1', ownerName: userName, gestioneDal: gd });
  for (const p of plan.properties) F.put('properties/' + p.id, p.data);
  for (const c of plan.contracts) F.put('contracts/' + c.id, c.data);
  for (const x of plan.payments) F.put('payments/' + x.id, x.data);
  F.put('users/own1', { role: 'landlord', name: userName, email: 'chiara@example.invalid', ...(mode !== undefined ? { rendicontoMode: mode } : {}) });
  const key = (int, m) => [...F.store.keys()].find((k) => k.startsWith('payments/') && k.includes('_' + int + '_') && k.endsWith('_' + m));
  const pay = (int, m, patch) => { const k = key(int, m); if (k) F.put(k, { ...F.store.get(k), ...patch }); return k; };
  pay('11', M, { status: 'paid', paidDate: M + '-03', paidVia: 'dichiarato' });
  pay('7', M0, { status: 'paid', paidDate: M0 + '-20', paidVia: 'bonifico', paidEvidence: 'conferma-proprietaria' });
  pay('13', M, { tenantReported: true, tenantReportDate: M + '-06' });
  pay('11', M0, { status: 'paid', paidDate: M + '-10', paidVia: 'stripe' });
  pay('7', M, { lastReminderDate: M + '-12', dunningHistory: [{ channel: 'whatsapp', kind: 'sollecito', at: M + '-12T10:00:00Z', month: M, by: 'adm' }] });
  return plan;
}
const docs = (col) => [...F.store.entries()].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ id: k.split('/')[1], ...v }));
const mkRes = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const handler = (await import('../../api/owners/rendiconto.js')).default;
const drive = async (query = {}) => { const res = mkRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer cron-test-secret' }, query, body: {} }, res); return res; };

// ═══ 1. Presa in carico, nessuna modalità scelta → ANTEPRIMA all'operatore ══
let pdfTxt = '', previewHtml = '';
{
  seed();
  const r = await drive();
  const res = r.body.results[0] || {};
  check('modalità predefinita con interni presi in carico = anteprima', res.mode === 'preview' && /presi in carico/.test(res.modeSource));
  check('anteprima: UNA email, all\'operatore, mai alla proprietaria',
    mails().length === 1 && mails()[0].to === 'operatore@example.invalid' && !mails().some((m) => m.to === 'chiara@example.invalid'));
  const m = mails()[0];
  previewHtml = String(m.html);
  check('anteprima: oggetto «ANTEPRIMA — Rendiconto di …»', /^ANTEPRIMA — Rendiconto di /.test(m.subject) && m.subject.includes(P.monthLabel(M)));
  check('anteprima: il corpo dice che NON è stato inviato alla proprietaria', /non inviato alla proprietaria/.test(previewHtml) && /chiara@example\.invalid/.test(previewHtml));
  check('anteprima: lo stato del mese è sent·preview (una volta sola)', (F.store.get(`rendiconti/own1_${M}`) || {}).status === 'sent' && F.store.get(`rendiconti/own1_${M}`).mode === 'preview');
  check('anteprima: il PDF non va sul percorso del rendiconto vero', F.storageFiles.has(`rendiconti/own1/anteprima_${M}.pdf`) && !F.storageFiles.has(`rendiconti/own1/rendiconto_${M}.pdf`));
  pdfTxt = await F.pdfText(m.attachments[0].content);

  // Coerenza: i numeri sono quelli della pagina del Palazzo, stesso mese.
  const ctx = P.context({ properties: docs('properties'), contracts: docs('contracts'), payments: docs('payments'), now: NOW });
  const model = P.model(ctx, null, M, { strip: false });
  check('stessi numeri del Palazzo: dovuto, pagato, arretrati',
    res.expected === model.totals.expected && res.collected === model.totals.collected && res.arrears === model.totals.arrears);
  // Gli arretrati contati a mano dalle rate (paymentState), senza il motore.
  const overdue = docs('payments').filter((p) => RENT.paymentState(p, NOW) === 'overdue').reduce((a, p) => a + p.amount, 0);
  check('arretrati = rate scadute e non pagate ad oggi (paymentState), mese chiuso compreso', Math.abs(res.arrears - overdue) < 0.01 && overdue > 0);
  const k13 = [...F.store.keys()].find((k) => k.includes('_13_') && k.endsWith('_' + M));
  check('un bonifico segnalato NON è un arretrato', RENT.paymentState(F.store.get(k13), NOW) === 'reported' && !/Arretrato: rata di [^\n]*\n?[^\n]*06\//.test(pdfTxt));
  // Riprova a mano: senza la rata segnalata nel conto, arretrati invariati.
  check('il totale arretrati non contiene la rata segnalata', Math.abs(res.arrears - docs('payments').filter((p) => p.status === 'pending' && !p.tenantReported && p.dueDate < P.day(NOW)).reduce((a, p) => a + p.amount, 0)) < 0.01);
}

// ═══ 2. Il PDF: titoli, contratto in arrivo, canone+oneri, parole ════════
{
  const titles = (pdfTxt.match(/^Int\. \d+[^\n]*$/gm) || []).filter((t) => !/segue/.test(t));
  check('cinque sezioni, cinque titoli DIVERSI con l\'interno', titles.length === 5 && new Set(titles).size === 5 && ['5', '7', '11', '13', '14'].every((n) => titles.some((t) => t.startsWith('Int. ' + n))));
  check('nessun titolo è il solo indirizzo ripetuto', !/^Piazzale Finto 42, Roma$/m.test(pdfTxt.split('Il mese in breve')[1].split('Int. 5')[0] || ''));
  check('ordine dell\'interno in numero (5, 7, 11, 13, 14)', pdfTxt.indexOf('Int. 5') < pdfTxt.indexOf('Int. 7') && pdfTxt.indexOf('Int. 7') < pdfTxt.indexOf('Int. 11') && pdfTxt.indexOf('Int. 11') < pdfTxt.indexOf('Int. 13') && pdfTxt.indexOf('Int. 13') < pdfTxt.indexOf('Int. 14'));
  check('contratto da caricare: «in arrivo da BOOM», mai un canone a zero', (pdfTxt.match(/in arrivo da BOOM/g) || []).length >= 2 && !/€0(?![\d.,])/.test(pdfTxt) && !/0\/mese/.test(pdfTxt));
  // Le righe lunghe vanno a capo nel PDF: si confrontano ricomposte.
  const flat = pdfTxt.replace(/\n/g, ' ');
  // Contratto dal 15: la rata non scade mai prima dell'inizio del suo periodo
  // (rilievo 12), quindi il 15 e non il 5 del giorno di pagamento.
  check('la rata scaduta del mese: NON PAGATA, con la data e la richiesta di pagamento registrata',
    new RegExp(`Rata di ${MESE} \\(15/\\d\\d–14/\\d\\d\\) · NON PAGATA, scaduta il 15/${M.slice(5)}/${M.slice(0, 4)} · pagamento chiesto all'inquilino il 12/${M.slice(5)}`).test(flat));
  check('il bonifico segnalato: in verifica da BOOM', new RegExp(`bonifico segnalato dall'inquilino il 06/${M.slice(5)}/${M.slice(0, 4)}, in verifica da BOOM`).test(pdfTxt));
  check('canone e oneri: righe distinte nel contratto e nella rata', /Canone mensile\n€1\.500/.test(pdfTxt) && /Oneri accessori mensili \(acconto\)\n€120/.test(pdfTxt) && /canone €1\.500 \+ oneri accessori €120/.test(pdfTxt));
  // Il totale degli oneri versati nell'anno (per il conguaglio): int. 7 ha
  // pagato la rata del mese prima con la scomposizione scritta (120 di oneri).
  check('oneri versati nell\'anno, per il conguaglio (solo dalle rate pagate con la scomposizione)', M0.slice(0, 4) === M.slice(0, 4)
    ? new RegExp(`Oneri accessori versati nel ${M.slice(0, 4)}\\n€120`).test(pdfTxt)
    : !new RegExp(`Oneri accessori versati nel ${M.slice(0, 4)}\\n€120`).test(pdfTxt));
  check('il canale in parole: «dichiarato dalla proprietà», «carta, tramite BOOM»', /pagata il 03\/\d\d\/\d{4} · dichiarato dalla proprietà/.test(pdfTxt) && /carta, tramite BOOM/.test(pdfTxt) && !/\((stripe|bank|dichiarato)\)/.test(pdfTxt));
  check('l\'incasso arrivato nel mese per un altro mese: con la sua data', new RegExp(`Incassata il 10/${M.slice(5)}/${M.slice(0, 4)}: rata di ${MESE0}`).test(pdfTxt));
  check('mesi a parole, mai «Rata 2026-…» grezzo', !/Rata \d{4}-\d\d/.test(pdfTxt) && new RegExp(`RENDICONTO DI ${P.monthLabel(M).toUpperCase()}`).test(pdfTxt));
  check('il locatore società è detto, alla c.a. della persona', /Locatore: Prova Immobiliare S\.r\.l\. · alla c\.a\. di Chiara Prova/.test(pdfTxt) && !/^Proprietario: /m.test(pdfTxt));
  check('nomi non latini traslitterati, mai vuoti', /Ivan Testov, Olga Prova/.test(pdfTxt) && /Sule Örnek, Mehmet Prova/.test(pdfTxt));
  check('euro con il punto delle migliaia', /€1\.620/.test(pdfTxt) && !/€1620/.test(pdfTxt));
  check('le note dicono cosa sono arretrati e oneri e «tramite BOOM»', /Un bonifico segnalato dall'inquilino non è un arretrato/.test(pdfTxt) && /salvo conguaglio: non fanno parte del canone/.test(pdfTxt) && /arrivato sul conto di BOOM, non su quello del locatore/.test(pdfTxt));
  check('il mese in breve nomina gli interni', /Non hanno pagato la rata di [^:]+: int\. 7/.test(pdfTxt) && /In verifica da BOOM: int\. 13/.test(pdfTxt) && /Contratto in arrivo da BOOM: int\. 5, int\. 14/.test(pdfTxt));
}

// ═══ 3. Email: niente «Nessun arretrato», niente gergo ════════════════════
{
  check('email: dice chi non ha pagato, chi è in verifica, i contratti in arrivo',
    /Non hanno pagato la rata di/.test(previewHtml) && /int\. 7/.test(previewHtml) && /In verifica da BOOM<\/strong> — int\. 13/.test(previewHtml) && /Contratto in arrivo da BOOM<\/strong> — int\. 5, int\. 14/.test(previewHtml));
  check('email: mai «Nessun arretrato» con arretrati', !/Nessun arretrato/.test(previewHtml));
  check('email: il locatore senza doppio punto', /Locatore: Prova Immobiliare S\.r\.l\.(<|\s)/.test(previewHtml) && !/S\.r\.l\.\./.test(previewHtml));
}

// ═══ 4. Rerun in anteprima: niente. Poi «automatico»: parte a lei, una volta ══
{
  const n0 = mails().length;
  const r = await drive();
  check('rerun in anteprima: nessuna seconda anteprima', mails().length === n0 && r.body.counts.alreadySent === 1);
  F.put('users/own1', { ...F.store.get('users/own1'), rendicontoMode: 'auto' });
  const r2 = await drive();
  const m = mails()[mails().length - 1];
  check('passata ad «automatico»: il mese parte alla proprietaria (l\'anteprima non conta come invio)',
    r2.body.counts.sent === 1 && m.to === 'chiara@example.invalid' && /^📒 Rendiconto di /.test(m.subject) && !/ANTEPRIMA/.test(m.subject) && !/non inviato alla proprietaria/.test(String(m.html)));
  check('…e lo stato del mese è sent·auto', F.store.get(`rendiconti/own1_${M}`).mode === 'auto' && F.store.get(`rendiconti/own1_${M}`).status === 'sent');
  check('PDF del rendiconto vero al suo percorso', F.storageFiles.has(`rendiconti/own1/rendiconto_${M}.pdf`));
  const n1 = mails().length;
  await drive();
  check('rerun dopo l\'invio vero: zero email', mails().length === n1);
  F.put('users/own1', { ...F.store.get('users/own1'), rendicontoMode: 'preview' });
  await drive();
  check('tornata ad anteprima DOPO averlo ricevuto: niente (l\'ha già)', mails().length === n1);
  // Anteprima a mano (?preview=1): all'operatore, sempre, senza toccare lo stato.
  F.put('users/own1', { ...F.store.get('users/own1'), rendicontoMode: 'auto' });
  const before = JSON.stringify(F.store.get(`rendiconti/own1_${M}`));
  const r3 = await drive({ preview: '1' });
  const last = mails()[mails().length - 1];
  check('?preview=1: anteprima all\'operatore anche se lei l\'ha già ricevuto', r3.body.counts.previews === 1 && last.to === 'operatore@example.invalid' && /^ANTEPRIMA/.test(last.subject));
  check('?preview=1: lo stato del mese non cambia', JSON.stringify(F.store.get(`rendiconti/own1_${M}`)) === before);
}

// ═══ 5. Le altre modalità ══════════════════════════════════════════════
{
  seed({ mode: 'off' });
  const r = await drive();
  check('«off»: nessuna email, nessuno stato', mails().length === 0 && r.body.counts.skippedOff === 1 && !F.store.has(`rendiconti/own1_${M}`));
  seed({ mode: 'manuale' });
  const r2 = await drive();
  check('modalità sconosciuta: anteprima (mai un invio per un refuso), e lo dice', r2.body.results[0].mode === 'preview' && r2.body.results[0].modeInvalid === 'manuale' && mails().length === 1 && mails()[0].to === 'operatore@example.invalid');
  seed({ mode: 'auto' });
  await drive();
  check('«auto» esplicito anche con interni presi in carico: alla proprietaria', mails().length === 1 && mails()[0].to === 'chiara@example.invalid');
}

// ═══ 6. Gestione BOOM dal: i mesi prima non esistono ════════════════════
{
  seed({ mode: 'auto', gd: CUR });
  const r = await drive();
  check('gestione da questo mese: il rendiconto del mese scorso NON parte', mails().length === 0 && r.body.results[0].skipped === 'before_management' && !F.store.has(`rendiconti/own1_${M}`));
  seed({ mode: 'auto' });
  const k = [...F.store.keys()].find((x) => x.startsWith('properties/') && x.endsWith('_13'));
  F.put(k, { ...F.store.get(k), gestioneDal: CUR });
  const r2 = await drive();
  const txt = await F.pdfText(mails()[0].attachments[0].content);
  check('un interno preso in gestione dopo il mese: fuori dalle sezioni, detto nelle note', !/^Int\. 13/m.test(txt) && /presi in gestione da BOOM dopo [^,]+, quindi non compresi: int\. 13/.test(txt));
  check('…e i suoi numeri fuori dai totali', r2.body.results[0].expected === 1620 + 1600);
}

// ═══ 7. Il locatore: detto solo quando è un altro ════════════════════════
{
  seed({ mode: 'auto', userName: 'Prova Immobiliare S.r.l.' });
  await drive();
  const txt = await F.pdfText(mails()[0].attachments[0].content);
  check('locatore = account: «Proprietario:», nessuna riga Locatore', /Proprietario: Prova Immobiliare S\.r\.l\./.test(txt) && !/Locatore:/.test(txt));
  check('a una società si scrive «Spett.le», non «Gentile Prova»', /Spett\.le Prova Immobiliare S\.r\.l\.,/.test(String(mails()[0].html)));
  seed({ mode: 'auto' });
  const c11 = [...F.store.keys()].find((x) => x.startsWith('contracts/') && x.includes('_11_'));
  F.put(c11, { ...F.store.get(c11), landlordName: 'Altra Società S.p.A.' });
  await drive();
  const txt2 = await F.pdfText(mails()[0].attachments[0].content);
  check('due locatori diversi: ognuno sulla sua sezione', /Locatore\nAltra Società S\.p\.A\./.test(txt2) && /Locatore\nProva Immobiliare S\.r\.l\./.test(txt2) && !/alla c\.a\./.test(txt2));
}

// ═══ 7b. Il recap Telegram: «1 anteprima», mai «1 anteprime» ═════════════
{
  seed();
  process.env.TELEGRAM_BOT_TOKEN = 'tg-test'; process.env.TELEGRAM_CHAT_ID = '1';
  await drive();
  delete process.env.TELEGRAM_BOT_TOKEN;
  const t = F.telegrams.join('\n');
  check('recap Telegram: «1 anteprima all\'operatore (NON inviata)»', /👁 1 anteprima all'operatore \(NON inviata\)/.test(t) && !/1 anteprime/.test(t));
}

// ═══ 8. La rata del mese ANNULLATA: detta col motivo, mai «in verifica» ════
// Un mese condonato (o una rata tolta dall'operatore) su un contratto vivo:
// il motore del Palazzo dà lo stato «waived». Prima il rendiconto stampava
// «non ancora registrata, in verifica da BOOM» — una verifica che non c'è.
{
  seed({ mode: 'auto' });
  const k = [...F.store.keys()].find((x) => x.startsWith('payments/') && x.includes('_11_') && x.endsWith('_' + M));
  F.put(k, { ...F.store.get(k), status: 'cancelled', cancelledAt: M + '-02T09:00:00Z', cancelledReason: 'mese condonato', paidDate: null });
  await drive();
  const m = mails()[0] || {};
  const txt = m.attachments ? await F.pdfText(m.attachments[0].content) : '';
  const u11 = (txt.split(/^Int\. 11/m)[1] || '').split(/^Int\. 13/m)[0];
  check('rata annullata: la sezione dice «annullata (motivo)»', new RegExp(`Rata di ${MESE} · annullata \\(mese condonato\\)`).test(u11.replace(/\n/g, ' ')));
  check('rata annullata: mai «non ancora registrata, in verifica da BOOM»', !/non ancora registrata/.test(u11) && !/non ancora registrata/.test(txt));
  check('rata annullata: il mese in breve la nomina col motivo', new RegExp(`Rata di ${MESE} annullata: int\\. 11 \\(mese condonato\\)`).test(txt.replace(/\n/g, ' ')));
  check('rata annullata: l\'interno NON è fra «In verifica da BOOM»', !/In verifica da BOOM: [^.]*int\. 11/.test(txt.replace(/\n/g, ' ')));
  check('rata annullata: l\'email lo dice', /Rata annullata<\/strong> — int\. 11 \(mese condonato\)/.test(String(m.html)));
}

console.log(`\nRendiconto · palazzo: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
