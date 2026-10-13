// tests/rendiconto/revisione.mjs — quello che il rendiconto DICE, dopo la
// revisione del 13/10/2026 del ramo S6 (dati inventati).
//
// LE REGOLE:
//  - «Nessun arretrato» si decide dal NUMERO di rate scadute, mai dalla somma:
//    una rata scaduta senza importo leggibile faceva 0 euro e il documento
//    diceva insieme «non hanno pagato» e «nessun arretrato»;
//  - senza importi leggibili gli arretrati sono «da verificare», mai «€0»
//    (PDF, email, il mese in breve); con una somma vera e qualche rata senza
//    importo, la somma più «da verificare»;
//  - una rata di più mesi (trimestrale) SCADUTA che copre il mese è detta
//    NON PAGATA nella sezione, con l'importo; segnalata = «in verifica da
//    BOOM»; pagata o da pagare = la riga neutra «Coperto dalla…»;
//  - nel riepilogo il ritardo dice QUALE rata, quando il mese non ne ha una sua;
//  - wa(): Š š Ž ž Œ œ Ÿ sono lettere stampabili, non un segnaposto.
// Uso: node tests/rendiconto/revisione.mjs
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
process.env.FIREBASE_PROJECT_ID = 'test-proj';

const F = await import('./_fake.mjs');
const R = await import('../../api/owners/rendiconto.js');
const { wa } = await import('../../api/_pdfbrand.js');
let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const textOf = (html) => String(html).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#8203;/g, ' ').replace(/\s+/g, ' ');

const NOW = new Date('2026-11-01T07:10:00+01:00');
const base = (payments, extra = {}) => R.ownerReport({
  ownerId: 'o1', user: { name: 'Prova Uno', email: 'p@example.invalid' }, landlord: null,
  properties: [{ id: 'p1', ownerId: 'o1', address: 'Via Finta 3, Roma', interno: '2' }, { id: 'p2', ownerId: 'o1', address: 'Via Finta 3, Roma', interno: '4' }],
  contracts: [
    { id: 'c1', propertyId: 'p1', tenantName: 'Inquilino Uno', rent: 1000, status: 'active', startDate: '2026-09-01', endDate: '2027-08-31' },
    { id: 'c2', propertyId: 'p2', tenantName: 'Inquilino Due', rent: 800, status: 'active', startDate: '2026-09-01', endDate: '2027-08-31' },
  ],
  payments, maintenance: [], users: [], month: '2026-10', now: NOW, ...extra,
});

// ═══ 1. Una rata scaduta senza importo: mai «Nessun arretrato», mai «€0» ══
{
  const rep = base([
    { id: 'a1', contractId: 'c1', propertyId: 'p1', type: 'rent', amount: null, month: '2026-10', dueDate: '2026-10-05', status: 'pending' },
    { id: 'a2', contractId: 'c2', propertyId: 'p2', type: 'rent', amount: 800, month: '2026-10', dueDate: '2026-10-05', status: 'paid', paidDate: '2026-10-04', paidVia: 'bonifico' },
  ]);
  check('totali: una rata scaduta contata, somma 0, una senza importo', rep.totals.arrearsCount === 1 && rep.totals.arrears === 0 && rep.totals.arrearsUnknown === 1);
  check('il mese in breve: «non hanno pagato» e NESSUN «Nessun arretrato»', rep.brief.some((x) => /Non hanno pagato la rata di ottobre 2026: int\. 2/.test(x)) && !rep.brief.some((x) => /Nessun arretrato/.test(x)));
  check('…e dice «Arretrati: importo da verificare»', rep.brief.some((x) => /Arretrati al 01\/11\/2026: importo da verificare \(una rata scaduta senza importo registrato\)/.test(x)));
  check('arrearsText: «da verificare», mai €0', R.arrearsText(rep.totals) === 'da verificare');
  const pdf = await F.pdfText(await R.buildPdf(rep));
  check('PDF: sotto ARRETRATI «da verificare» (dovute €800: l\'importo ignoto non si inventa), nessun «Nessun arretrato»', /ARRETRATI AL 01\/11\/2026\n€800\n€800\nda verificare/.test(pdf) && !/Nessun arretrato/.test(pdf));
  check('PDF: la nota al singolare («BOOM la sta verificando»)', /Una rata è senza importo registrato: BOOM la sta verificando\./.test(pdf));
  const mail = R.emailFor(rep, {});
  const t = textOf(mail.html);
  check('email: il riquadro arretrati «da verificare», l\'avviso giallo, nessun ✅', /Arretrati al 01\/11\/2026 da verificare/.test(t) && /Arretrati: importo da verificare — una rata scaduta senza importo registrato, BOOM la sta verificando/.test(t) && !/Nessun arretrato/.test(t));
}

// ═══ 2. Somma vera + una rata senza importo: la somma, più «da verificare» ═
{
  const rep = base([
    { id: 'b1', contractId: 'c1', propertyId: 'p1', type: 'rent', amount: null, month: '2026-10', dueDate: '2026-10-05', status: 'pending' },
    { id: 'b2', contractId: 'c2', propertyId: 'p2', type: 'rent', amount: 800, month: '2026-10', dueDate: '2026-10-05', status: 'pending' },
  ]);
  check('somma 800 + una senza importo: la somma, più «una rata con importo da verificare»',
    R.arrearsText(rep.totals) === '€800' && rep.brief.some((x) => /Arretrati al 01\/11\/2026: €800, più una rata con importo da verificare\./.test(x)));
  const pdf = await F.pdfText(await R.buildPdf(rep));
  check('PDF: €800 e sotto «più una rata da verificare»', /ARRETRATI AL 01\/11\/2026\n€0\n€800\n€800\n[\s\S]*più una rata da verificare/.test(pdf));
  const t = textOf(R.emailFor(rep, {}).html);
  check('email: €800 e «più una rata da verificare» nel riquadro', /Arretrati al 01\/11\/2026 €800 più una rata da verificare/.test(t));
}

// ═══ 3. Nessuna rata scaduta: «Nessun arretrato» resta ═════════════════════
{
  const rep = base([
    { id: 'c1x', contractId: 'c1', propertyId: 'p1', type: 'rent', amount: 1000, month: '2026-10', dueDate: '2026-10-05', status: 'paid', paidDate: '2026-10-03', paidVia: 'bonifico' },
    { id: 'c2x', contractId: 'c2', propertyId: 'p2', type: 'rent', amount: 800, month: '2026-10', dueDate: '2026-10-05', status: 'paid', paidDate: '2026-10-03', paidVia: 'bonifico' },
  ]);
  check('tutto pagato: «Nessun arretrato al 01/11/2026», arrearsText €0', rep.brief.includes('Nessun arretrato al 01/11/2026.') && R.arrearsText(rep.totals) === '€0');
  check('email: ✅ Nessun arretrato', /Nessun arretrato al 01\/11\/2026/.test(textOf(R.emailFor(rep, {}).html)));
}

// ═══ 4. La rata trimestrale che copre il mese ═════════════════════════════
const quarter = (status, extra = {}) => base([
  { id: 'q1', contractId: 'c1', propertyId: 'p1', type: 'rent', amount: 3000, month: '2026-09', coversTo: '2026-11', installmentMonths: 3, dueDate: '2026-09-05', status, ...extra },
]);
{
  const rep = quarter('pending', { lastReminderDate: '2026-09-20' });
  const s = rep.sections.find((x) => x.interno === '2');
  const late = s.lines.find((l) => l.tone === 'late');
  check('trimestrale scaduta: la sezione dice NON PAGATA, con l\'importo e il sollecito',
    !!late && late.amount === 3000 && /^Rata da settembre 2026 a novembre 2026 · NON PAGATA, scaduta il 05\/09\/2026 · pagamento chiesto all'inquilino il 20\/09\/2026$/.test(late.text));
  check('…nessuna riga neutra «Coperto dalla…» per una rata non pagata', !s.lines.some((l) => /^Coperto dalla/.test(l.text)));
  check('…il riepilogo dice quale rata', rep.brief.some((x) => /Non hanno pagato la rata di ottobre 2026: int\. 2 \(rata da settembre 2026 a novembre 2026, scaduta il 05\/09\/2026\)\./.test(x)));
  const pdf = await F.pdfText(await R.buildPdf(rep));
  check('PDF: la riga NON PAGATA nella sezione dell\'interno', /Int\. 2[\s\S]*Rata da settembre 2026 a novembre 2026 · NON PAGATA, scaduta il 05\/09\/2026/.test(pdf));
  const t = textOf(R.emailFor(rep, {}).html);
  check('email: il ritardo con la rata che copre il mese', /Non hanno pagato la rata di ottobre 2026 — int\. 2 \(rata da settembre 2026 a novembre 2026, scaduta il 05\/09\/2026\)/.test(t));
}
{
  const rep = quarter('pending', { tenantReported: true, tenantReportDate: '2026-09-04' });
  const s = rep.sections.find((x) => x.interno === '2');
  check('trimestrale segnalata: «in verifica da BOOM», mai arretrato né «Coperto»',
    s.lines.some((l) => l.tone === 'review' && /^Rata da settembre 2026 a novembre 2026 · bonifico segnalato dall'inquilino il 04\/09\/2026, in verifica da BOOM$/.test(l.text) && l.amount === 3000)
    && !s.lines.some((l) => /^Coperto dalla/.test(l.text)) && rep.totals.arrearsCount === 0);
}
for (const [status, extra, want] of [['paid', { paidDate: '2026-09-03', paidVia: 'bonifico' }, /^Coperto dalla rata da settembre 2026 a novembre 2026, pagata — importo nel rendiconto di settembre 2026$/],
  ['pending', null, /^Coperto dalla rata da settembre 2026 a novembre 2026 — importo nel rendiconto di settembre 2026$/]]) {
  // «da pagare»: la stessa rata con la scadenza ancora davanti.
  const rep = extra ? quarter(status, extra) : base([{ id: 'q2', contractId: 'c1', propertyId: 'p1', type: 'rent', amount: 3000, month: '2026-09', coversTo: '2026-11', installmentMonths: 3, dueDate: '2026-11-20', status }]);
  const s = rep.sections.find((x) => x.interno === '2');
  check(`trimestrale ${extra ? 'pagata' : 'da pagare'}: resta la riga neutra «Coperto dalla…»`, s.lines.some((l) => l.tone === 'muted' && want.test(l.text)));
}

// ═══ 5. wa(): le lettere WinAnsi fuori da Latin-1 sono lettere ════════════
check('wa(«Šš»), wa(«Ž. Ž.»), wa(«Œ») restano, non diventano il segnaposto', wa('Šš') === 'Šš' && wa('Ž. Ž.') === 'Ž. Ž.' && wa('Œ') === 'Œ' && wa('Ÿ') === 'Ÿ');
check('…un testo senza nulla di stampabile resta il segnaposto', /non stampabili/.test(wa('王小明')));

console.log(`\nRendiconto · revisione: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
