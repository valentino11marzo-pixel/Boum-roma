// tests/modeljson/run.mjs — IL JSON DEL MODELLO, LETTO UNA VOLTA SOLA.
//
// Nato da un guasto VERO letto nei log di produzione il 31/08/2026:
// l'Innesto è morto due volte (`ai_bad_json`) su due contratti reali
// dell'operatore, e nel log della morte ci sono finiti — in chiaro, dentro
// Vercel — il codice fiscale e l'IBAN dei proprietari.
//
// Le tre regole che questa suite difende:
//  1. si sistema solo la FORMA (recinto, prosa, virgole, commenti, a capo);
//  2. una risposta TRONCATA non si ripara mai — un indirizzo letto a metà
//     consegnato come buono è peggio di un errore;
//  3. la diagnosi non porta contenuto: nei log finiscono forma e misura.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModelJson, modelJson, jsonFailureLine, jsonFailureHint } from '../../api/_modeljson.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. Quello che i modelli scrivono davvero ────────────────────────────
ok(parseModelJson('{"rent":1100}').value.rent === 1100, 'JSON nudo');

ok(parseModelJson('```json\n{"rent":1100}\n```').value.rent === 1100,
  'dentro il recinto ```json (la forma più comune)');

ok(parseModelJson('Ecco i dati estratti:\n```json\n{"rent":1100}\n```\nSpero sia utile.').value.rent === 1100,
  'con la prosa prima e dopo');

// LA GRAFFA NELLA PROSA: è il difetto che lastIndexOf('}') non poteva vedere.
const conNota = '{"rent":1100}\n\nNota: il deposito {non indicato nel documento}.';
ok(parseModelJson(conNota).value.rent === 1100,
  'una graffa nel commento DOPO il JSON non sposta la fine (lastIndexOf tagliava a caso)');

ok(parseModelJson('{"address":"via Garibaldi 12/B }","rent":900}').value.rent === 900,
  'e una graffa DENTRO un valore nemmeno');

ok(parseModelJson('{"rent":1100,}').value.rent === 1100, 'virgola in coda');
ok(parseModelJson('{\n // dedotto dalla durata\n "months":12\n}').value.months === 12, 'commento // accanto a un campo');
ok(parseModelJson('{"url":"https://x.it//a","n":1}').value.url === 'https://x.it//a',
  'ma un // DENTRO una stringa è un indirizzo, non un commento');
ok(parseModelJson('{"note":"prima riga\nseconda riga"}').value.note === 'prima riga\nseconda riga',
  'un a capo vero dentro una stringa (le note dei modelli ne sono piene)');
ok(parseModelJson('{"note":"virgola, dentro","n":2}').value.n === 2,
  'e una virgola dentro una stringa resta una virgola');

// ── 2. La regola che protegge l'operatore: TRONCATA ≠ RIPARABILE ────────
// Il caso vero del 28/08: la lettura si interrompe a metà indirizzo.
const tronca = '```json\n{\n "landlord": {"name":"S.R.L.","iban":"IT77105387032670000496"},\n "tenant": {"name":"Sara","address":"Roma, Via Crem';
const rt = parseModelJson(tronca);
ok(rt.ok === false && rt.why === 'truncated', 'una risposta tagliata si riconosce e si DICHIARA');
ok(rt.value === undefined,
  'e NON restituisce mai i pezzi letti: «Roma, Via Crem» consegnato come indirizzo è il danno peggiore');
// verifica per mutazione del suo contrario: se chiudessimo noi le graffe,
// quel mezzo indirizzo passerebbe per buono
const riparataAMano = JSON.parse(tronca.slice(tronca.indexOf('{')) + '"}}');
ok(riparataAMano.tenant.address === 'Roma, Via Crem',
  'prova del pericolo: chiudendo le graffe si otterrebbe un indirizzo mezzo letto, indistinguibile da uno vero');

ok(parseModelJson('').why === 'empty' && parseModelJson('   ').why === 'empty', 'risposta vuota');
ok(parseModelJson('Non riesco a leggere il documento.').why === 'no_object', 'nessun oggetto (il modello ha risposto a parole)');
ok(parseModelJson('{"a": <<<}').why === 'invalid', 'illeggibile anche dopo le correzioni di forma');
ok(modelJson('rumore') === null && modelJson('{"a":1}').a === 1, 'modelJson(): il valore o null, come prima');

// ── 3. La diagnosi non porta contenuto ──────────────────────────────────
const segreto = '```json\n{"codiceFiscale":"SRRSRA82S45C034Y","iban":"IT77I0538703267000049635352"';
const line = jsonFailureLine(segreto, 'truncated', 'max_tokens');
ok(!/SRRSRA|IT77I|codiceFiscale/.test(line),
  'la riga di log NON contiene il codice fiscale né l\'IBAN (nei log di produzione ci sono finiti davvero)');
ok(/why=truncated/.test(line) && /len=\d+/.test(line) && /fenced=1/.test(line) && /stop=max_tokens/.test(line),
  'ma dice tutto quello che serve per capire: perché, quanto, in che forma');
ok(/troppo lungo/.test(jsonFailureHint('truncated')) && !/JSON|parse|token/i.test(jsonFailureHint('truncated')),
  'e all\'operatore si dice cosa fare, non come si chiama il guasto');

// ── 4. Una copia sola: nessuno rilegge il JSON a mano ───────────────────
// La lettura fragile stava in OTTO file. Se ricompare, questa suite lo dice:
// un ottavo posto che sbaglia da solo è come non aver corretto niente.
const SITI = ['api/portal/ingest.js', 'api/wizard/describe.js', 'api/wizard/interpret.js',
  'api/profile/upload.js', 'api/agent/_claude.js', 'api/leads/scan-inbox.js',
  'api/contracts/inventario.js', 'api/documents/ocr.js'];
for (const f of SITI) {
  const s = src(f);
  ok(/_modeljson\.js'/.test(s), `${f}: usa la lettura condivisa`);
  ok(!/lastIndexOf\('\}'\)/.test(s), `${f}: niente più lastIndexOf('}') a mano`);
}

// e il guasto che ha aperto il caso: l'Innesto non stampa più il materiale
const ing = src('api/portal/ingest.js');
ok(!/raw\.slice\(0, ?\d+\)/.test(ing), 'ingest: il contenuto letto non finisce più nei log');
ok(/jsonFailureLine\(/.test(ing) && /jsonFailureHint\(/.test(ing),
  'ingest: logga la forma e spiega all\'operatore cosa fare');
ok(/stop_reason/.test(ing), 'ingest: guarda lo stop_reason di Anthropic — è la prova del taglio');

console.log(`\n${fail ? '✗' : '✓'} modeljson: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
