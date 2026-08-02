// tests/fatture/banca.mjs — il flusso dei movimenti: cosa è DAVVERO un incasso.
//
// La categoria dice di che natura è un movimento; il FLUSSO dice se è denaro
// di BOOM, ed è la seconda domanda quella che decide se va fatturato. Sul
// conto Sella la maggior parte di ciò che entra NON è ricavo: nel trimestre
// maggio-luglio 2026, su ~46.500 in entrata, le fee vere sono tre.
//
// Le due direzioni dell'errore, entrambe testate:
//   · troppo permissivo → depositi passanti e storni contati come incassi,
//     i totali gonfiati e un elenco di "da fatturare" pieno di roba che non
//     va fatturata. Un elenco che grida al lupo viene smesso di guardare.
//   · troppo severo → una fee vera non segnalata, e si torna al problema di
//     partenza: quattro mesi di fatture mancanti senza che nessuno lo sappia.
//
// Uso: node tests/fatture/banca.mjs
import { classifyFlow, feeWithoutInvoice, categorize } from '../../api/banking/_lib.js';

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond, detail) => {
  cond ? passed++ : (failed++, bad.push(name));
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''));
};
const tx = (bookingDate, amount, description, counterparty = '') => ({
  bookingDate, amount, description, counterparty,
  category: categorize({ amount, description, counterparty }),
});

// ═══ 1. Categoria: il compenso non è un canone ═══
{
  check('categoria: "provvigione intermediazione locazione" è un COMPENSO, non un canone',
    categorize({ amount: 1000, description: 'PROVVIGIONE INTERMEDIAZIONE LOCAZIONE' }) === 'compensi');
  check('categoria: property finding service', categorize({ amount: 427, description: 'Property finding service' }) === 'compensi');
  check('categoria: protection fee', categorize({ amount: 350, description: 'PROTECTION FEE' }) === 'compensi');
  check('categoria: un canone vero resta un canone',
    categorize({ amount: 1400, description: 'Affitto luglio via Cavour' }) === 'canoni');
  check('categoria: un\'uscita con la stessa parola non diventa un compenso',
    categorize({ amount: -1000, description: 'PROVVIGIONE pagata a collaboratore' }) !== 'compensi');
}

// ═══ 2. Storni: la coppia si annulla ═══
{
  // L'estratto di giugno: tre bonifici da 1.200 falliti e riaccreditati.
  // Dichiara 26.140 di entrate dove quelle reali sono 22.538.
  const movimenti = classifyFlow([
    tx('2026-06-03', 1200, 'BONIFICO A FAVORE DI ROSSI'),
    tx('2026-06-04', 1200, 'BONIFICO A FAVORE DI BIANCHI'),
    tx('2026-06-05', 1200, 'BONIFICO A FAVORE DI VERDI'),
    tx('2026-06-06', -1200, 'STORNO SCRITTURA OPERAZIONE DEL 03/06/2026'),
    tx('2026-06-07', -1200, 'STORNO SCRITTURA OPERAZIONE DEL 04/06/2026'),
    tx('2026-06-08', -1200, 'STORNO SCRITTURA OPERAZIONE DEL 05/06/2026'),
    tx('2026-06-11', 350, 'PROTECTION FEE'),
  ]);
  const storni = movimenti.filter(m => m.flow === 'storno');
  check('storno: tutte e sei le righe delle tre coppie sono neutralizzate', storni.length === 6, storni.length);
  check('storno: ogni riga è appaiata alla sua', storni.every(s => s.pairId !== null));
  const entrateNette = movimenti.filter(m => m.amount > 0 && m.flow !== 'storno').reduce((s, m) => s + m.amount, 0);
  check('storno: le entrate reali sono 350, non 3.950', entrateNette === 350, entrateNette);
  check('storno: la fee sopravvive allo storno accanto', movimenti[6].flow === 'fee');

  /* Con tre bonifici identici a giorni consecutivi, la vicinanza temporale
     sbaglia coppia: lo storno del 06/06 è più vicino al bonifico del 05/06.
     La banca però SCRIVE la data dell'originale nella causale — quando c'è,
     si appaia su quella. I totali tornerebbero comunque, ma un operatore che
     apre la coppia troverebbe una controparte che non c'entra. */
  const idx = movimenti.findIndex(m => m.description.includes('03/06'));
  check('storno: appaiato alla data DICHIARATA nella causale, non alla più vicina',
    movimenti[idx].pairId === '0', movimenti[idx].pairId);
  check('storno: ogni bonifico è appaiato al suo storno',
    movimenti[0].pairId === String(idx)
    && movimenti[1].pairId === String(movimenti.findIndex(m => m.description.includes('04/06')))
    && movimenti[2].pairId === String(movimenti.findIndex(m => m.description.includes('05/06'))));
  // Senza data nella causale si torna alla vicinanza temporale.
  const senzaData = classifyFlow([
    tx('2026-06-03', 800, 'BONIFICO'),
    tx('2026-06-04', -800, 'STORNO SCRITTURA'),
  ]);
  check('storno: senza data dichiarata vale la vicinanza temporale',
    senzaData[1].pairId === '0');

  // Uno storno senza originale nella finestra resta segnalato: non sparisce.
  const orfano = classifyFlow([tx('2026-06-06', -1200, 'STORNO SCRITTURA OPERAZIONE DEL 01/01/2020')]);
  check('storno: senza originale resta marcato, non ignorato', orfano[0].flow === 'storno');
}

// ═══ 3. Depositi passanti: entrano e riescono ═══
{
  const m = classifyFlow([
    tx('2026-05-04', 3000, 'Deposito cauzionale appartamento Cavour'),
    tx('2026-05-09', -3000, 'Inoltro deposito a proprietario Egidi'),
    tx('2026-05-12', 2400, 'Caparra confirmatoria Pigneto'),
    tx('2026-05-20', -2200, 'Inoltro deposito Pigneto al netto trattenute'),
    tx('2026-05-22', 427, 'Property finding service'),
  ]);
  check('passante: il deposito e il suo inoltro sono una coppia',
    m[0].flow === 'passante' && m[1].flow === 'passante');
  check('passante: regge una trattenuta (2.400 in, 2.200 out)',
    m[2].flow === 'passante' && m[3].flow === 'passante');
  check('passante: la fee vera resta una fee', m[4].flow === 'fee');
  const ricavi = m.filter(x => x.flow === 'fee').reduce((s, x) => s + x.amount, 0);
  check('passante: su 5.827 entrati, il ricavo è 427', ricavi === 427, ricavi);

  // Un'uscita PIÙ GRANDE dell'entrata non è la restituzione di quel deposito.
  const strano = classifyFlow([
    tx('2026-05-04', 1000, 'Deposito cauzionale'),
    tx('2026-05-09', -5000, 'Inoltro deposito'),
  ]);
  check('passante: un\'uscita maggiore dell\'entrata non viene appaiata',
    strano[0].flow === null && strano[1].flow === null);

  // Un deposito che NON è mai uscito resta da classificare: non è una fee.
  const trattenuto = classifyFlow([tx('2026-05-04', 3000, 'Deposito cauzionale Trastevere')]);
  check('passante: un deposito senza inoltro non diventa un ricavo', trattenuto[0].flow !== 'fee');

  // Un'uscita molto lontana nel tempo non è la stessa operazione.
  const lontano = classifyFlow([
    tx('2026-01-04', 3000, 'Deposito cauzionale'),
    tx('2026-11-09', -3000, 'Inoltro deposito'),
  ]);
  check('passante: fuori dalla finestra temporale non si appaia', lontano[0].flow === null);
}

// ═══ 4. Le fee, e solo quelle ═══
{
  const m = classifyFlow([
    tx('2026-01-26', 427, 'Property finding service', 'NAOR'),
    tx('2026-01-30', 1000, 'PROVVIGIONE INTERMEDIAZIONE LOCAZIONE', 'LAINE LINUS'),
    tx('2026-02-02', 1400, 'Affitto febbraio via Cavour', 'ROSSI'),
    tx('2026-02-03', 2380.50, 'ACCREDITO STRIPE DA STRIPE PAYMENTS'),
    tx('2026-02-05', -95, 'Commissioni e spese tenuta conto'),
  ]);
  check('fee: le due provvigioni sono fee', m[0].flow === 'fee' && m[1].flow === 'fee');
  check('fee: un canone non è una fee di BOOM', m[2].flow !== 'fee');
  // Un payout Stripe è il NETTO di molti pagamenti già riconciliati per altra
  // via: trattarlo come compenso da fatturare produrrebbe un allarme a ogni
  // accredito.
  check('fee: un payout Stripe non è un compenso da fatturare', m[3].flow !== 'fee');
  check('fee: le spese bancarie (uscita) non sono fee', m[4].flow !== 'fee');
}

// ═══ 5. L'allarme: fee senza fattura ═══
{
  const movimenti = classifyFlow([
    tx('2026-01-26', 427, 'Property finding service'),
    tx('2026-01-30', 1000, 'PROVVIGIONE INTERMEDIAZIONE LOCAZIONE'),
    tx('2026-03-01', 848, 'PROVVIGIONE INTERMEDIAZIONE LOCAZIONE'),
  ]);
  const fatture = [
    { dataFattura: '2026-02-10', lordo: 427 },   // copre la prima
  ];
  const scoperte = feeWithoutInvoice(movimenti, fatture);
  check('allarme: restano le due fee senza fattura', scoperte.length === 2, scoperte.map(s => s.amount));
  check('allarme: la fee già fatturata non viene segnalata',
    !scoperte.some(s => s.amount === 427));

  // Un movimento già collegato a mano non torna a suonare.
  const collegato = feeWithoutInvoice(
    movimenti.map(m => (m.amount === 1000 ? { ...m, invoiceId: 'inv_1' } : m)), fatture);
  check('allarme: un movimento già collegato tace', collegato.length === 1);

  // Prudenza deliberata: stesso importo, fattura fuori finestra → si segnala.
  const vecchia = feeWithoutInvoice(movimenti, [{ dataFattura: '2024-01-01', lordo: 427 }]);
  check('allarme: una fattura di due anni prima non copre un incasso di oggi',
    vecchia.length === 3, vecchia.length);

  // Storni e passanti non entrano MAI nell'elenco da fatturare.
  const misto = classifyFlow([
    tx('2026-05-04', 3000, 'Deposito cauzionale'),
    tx('2026-05-09', -3000, 'Inoltro deposito'),
    tx('2026-06-03', 1200, 'BONIFICO'),
    tx('2026-06-06', -1200, 'STORNO SCRITTURA OPERAZIONE DEL 03/06/2026'),
    tx('2026-06-11', 350, 'PROTECTION FEE'),
  ]);
  const daFare = feeWithoutInvoice(misto, []);
  check('allarme: solo la fee entra nell\'elenco, non deposito né storno',
    daFare.length === 1 && daFare[0].amount === 350, daFare.map(d => d.amount));
}

// ═══ 6. Purezza e robustezza ═══
{
  const input = [tx('2026-01-26', 427, 'Property finding service')];
  const copia = JSON.parse(JSON.stringify(input));
  classifyFlow(input);
  check('classifyFlow non modifica gli input', JSON.stringify(input) === JSON.stringify(copia));
  check('lista vuota non esplode', classifyFlow([]).length === 0 && feeWithoutInvoice([], []).length === 0);
  check('undefined non esplode', classifyFlow().length === 0 && feeWithoutInvoice().length === 0);
  check('una data mancante non appaia nulla a caso',
    classifyFlow([tx(null, 1200, 'BONIFICO'), tx(null, -1200, 'STORNO SCRITTURA')])[1].pairId === null);
}

console.log('\n' + (failed ? '❌' : '✅') + ` ${passed} passed, ${failed} failed`);
if (failed) { console.log('Falliti:\n  - ' + bad.join('\n  - ')); process.exit(1); }
