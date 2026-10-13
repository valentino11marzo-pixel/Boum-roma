// tests/rendiconto/wa.mjs — i nomi non latini nei PDF (lacuna 4 dell'audit).
//
// wa() (api/_pdfbrand.js) prepara il testo per i font standard dei PDF, che
// conoscono solo WinAnsi. Prima toglieva tutto il resto: «Şükrü Yılmaz»
// usciva «ükrü Ylmaz», «Иван Петров» una stringa VUOTA — sul rendiconto,
// sul verbale delle chiavi, sull'inventario. LE REGOLE:
//  - ciò che WinAnsi ha resta (accenti, €, apostrofo tipografico, trattini);
//  - turco, cirillico, greco e i latini estesi si traslitterano;
//  - un nome che aveva lettere non diventa MAI vuoto;
//  - nessun testo fa fallire il PDF (pdf-lib REALE, Helvetica standard).
// Nomi inventati. Uso: node tests/rendiconto/wa.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { wa } from '../../api/_pdfbrand.js';

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };

// Turco: le lettere che WinAnsi non ha diventano latine; ü, ö, ç (che ha) restano.
check('turco: Şükrü Yılmaz → Sükrü Yilmaz (ş, ı traslitterate; ü resta, è in tabella)', wa('Şükrü Yılmaz') === 'Sükrü Yilmaz');
check('turco: Ayşe Doğan → Ayse Dogan', wa('Ayşe Doğan') === 'Ayse Dogan');
check('turco: İnce, Çelik, Öztürk', wa('Ünal İnce') === 'Ünal Ince' && wa('Gülşen Çelik') === 'Gülsen Çelik' && wa('Mehmet Öztürk') === 'Mehmet Öztürk');
// Cirillico: la grafia dei passaporti (ICAO 9303).
check('cirillico: Иван Петров → Ivan Petrov', wa('Иван Петров') === 'Ivan Petrov');
check('cirillico: lettere doppie con la maiuscola giusta (Жанна → Zhanna, Щукин → Shchukin)', wa('Жанна') === 'Zhanna' && wa('Щукин') === 'Shchukin');
check('cirillico in maiuscolo resta maiuscolo (ЖАННА → ZHANNA)', wa('ЖАННА') === 'ZHANNA');
check('cirillico: Юлия → Iuliia (ICAO), Ольга → Olga', wa('Юлия') === 'Iuliia' && wa('Ольга') === 'Olga');
check('ucraino e serbo: Євген → Ievgen, Ђорђе → Djordje', wa('Євген') === 'Ievgen' && wa('Ђорђе') === 'Djordje');
// Greco, con le coppie che si leggono come una.
check('greco: Ευάγγελος Παπαδόπουλος → Evangelos Papadopoulos', wa('Ευάγγελος Παπαδόπουλος') === 'Evangelos Papadopoulos');
// Latini estesi.
check('polacco: Łukasz Wiśniewski → Lukasz Wisniewski', wa('Łukasz Wiśniewski') === 'Lukasz Wisniewski');
check('rumeno: Ștefan Țurcanu → Stefan Turcanu', wa('Ștefan Țurcanu') === 'Stefan Turcanu');
check('ceco/croato: Dvořák Šimić → Dvorák Šimic (Š è in WinAnsi e resta)', wa('Dvořák Šimić') === 'Dvorák Šimic');
check('vietnamita: Nguyễn Văn Đức → Nguyên Van Duc', wa('Nguyễn Văn Đức') === 'Nguyên Van Duc');
check('ungherese: Erdős Gyűrű → Erdos Gyuru', wa('Erdős Gyűrű') === 'Erdos Gyuru');
check('azero: Əliyev → Eliyev', wa('Əliyev') === 'Eliyev');

// La tabella WinAnsi esistente: intatta.
check('accenti italiani e apostrofo tipografico restano', wa('l’unità è così però') === 'l’unità è così però');
check('em-dash, ellissi ed euro restano', wa('Roma — 1.400 € …') === 'Roma — 1.400 € …');
check('virgolette tipografiche e «caporali» restano', wa('“sì” «no»') === '“sì” «no»');
check('le frecce diventano ->, le spunte X, il meno un trattino', wa('a → b ✓ −3') === 'a -> b X -3');
check('emoji fuori (farebbero fallire il PDF)', wa('Chiavi 🔑 ok') === 'Chiavi  ok');
check('un accento arrivato scomposto (e + ´) torna una lettera sola', wa('Perché') === 'Perché');
check('a capo e spazi sottili: uno spazio, mai parole incollate', wa('Via Roma\n12') === 'Via Roma 12' && wa('1 600') === '1 600');
check('i caratteri di controllo C1 (che il font non ha) spariscono', wa('a\u0085b') === 'ab');

// Mai un nome vuoto.
check('ideogrammi: un testo con lettere non diventa vuoto', wa('王小明').length > 0 && /non stampabili/.test(wa('王小明')));
check('misto: la parte latina resta, nessun segnaposto', wa('Ahmed أحمد').trim() === 'Ahmed');
check('lettere WinAnsi fuori da Latin-1 (Š š Ž ž Œ œ Ÿ): stampabili, mai il segnaposto', wa('Šš') === 'Šš' && wa('Ž. Ž.') === 'Ž. Ž.' && wa('Œ') === 'Œ' && wa('œŸ') === 'œŸ');
check('vuoto resta vuoto, null è vuoto, solo simboli restano senza segnaposto', wa('') === '' && wa(null) === '' && wa('🔑') === '');

// Nessun testo fa fallire il PDF.
{
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica), fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage();
  const sample = [];
  for (let c = 0x20; c < 0x3000; c += 1) sample.push(String.fromCodePoint(c));
  const all = ['Şükrü Yılmaz', 'Иван Петров', 'Ευάγγελος', '王小明', '🔑🏠', sample.join('')];
  let threw = '';
  for (const t of all) for (const font of [f, fb]) { try { page.drawText(wa(t), { x: 10, y: 10, size: 8, font }); } catch (e) { threw = t.slice(0, 20) + ': ' + e.message; } }
  check('pdf-lib: ogni carattere da U+0020 a U+2FFF passa (Helvetica e Helvetica-Bold)', !threw);
  if (threw) console.log('  ' + threw);
  const bytes = await pdf.save();
  check('…e il documento si salva', bytes.length > 500);
}

console.log(`\nRendiconto · wa: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
