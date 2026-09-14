// VERBATIM — le clausole che stampiamo sono quelle del modello dell'associazione.
//
// "Verbatim" era una dichiarazione nei commenti; qui diventa una misura: si
// legge il .doc VERO in reference/ (col lettore in tests/_doc.mjs), si
// prendono dal sorgente di js/contract-pdf.js le frasi FISSE di ogni
// articolo (i pezzi fra un `${…}` e l'altro, lunghi almeno 40 caratteri) e
// si pretende che ognuna stia nel modello, parola per parola. Le
// normalizzazioni ammesse sono ELENCATE (refusi dell'originale: "E'" → "È",
// "dei presente" → "del presente", una parentesi mai chiusa, "non è
// superiore"…): tutto il resto e' deriva.
//
// Trovato al primo giro, sul modello C: "saranno a carico" dove il modello
// dice "sono a carico" — una parola, in un contratto che si firma.
import { readFileSync } from 'node:fs';
import { docText } from '../_doc.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL ' + name + (extra ? '\n      ' + extra : '')); } };
const R = (rel) => new URL(rel, import.meta.url);
const src = readFileSync(R('../../js/contract-pdf.js'), 'utf8');

// Le normalizzazioni dichiarate (refusi del modello → come li stampiamo).
const NORMALIZE = [
  [/E'\s+facolt/g, 'È facolt'],
  [/dei presente contratto/g, 'del presente contratto'],
  [/Organizzazione della Propriet/g, 'Organizzazioni della Propriet'],
  [/RA\/2023\/044852/g, 'RA/2023/0044852'],
  [/ove esistente, dei documenti/g, 'ove esistente) dei documenti'],
  [/non è superiore a quella/g, 'non superiore a quella'],
  [/precedente \./g, 'precedente.'],
  [/l'immobile : locato/g, "l'immobile locato"],
  [/corrisposto,\s*$/m, 'corrisposto.'],
  [/conviventi--/g, 'conviventi: --'],
  [/garanzia, 4 \(Oneri/g, 'garanzia), 4 (Oneri'],
];
// Si confronta il CONTENUTO: minuscolo, senza punteggiatura ne' virgolette
// (una virgola in piu' o "Roma capitale" contro "Roma Capitale" non sono
// una clausola diversa; "saranno" contro "sono" si').
const norm = (s) => String(s)
  .replace(/[\u2019\u2018`']/g, '').replace(/[\u201c\u201d"]/g, '').replace(/\u00a0/g, ' ')
  .replace(/[,.;:()]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
// Le VARIANTI nostre, dichiarate: frasi che il modello non ha perche' nascono
// da un caso che il modello lascia al compilatore (niente deposito; canone
// riferito all'intera durata quando il contratto non e' di 12 mesi).
const VARIANTS = [
  'le parti concordano che per il presente contratto non viene costituito deposito cauzionale',
  'il canone di locazione riferito allintera durata contrattuale di',
];
function modelText(file) {
  let t = docText(readFileSync(R('../../reference/' + file)));
  for (const [re, to] of NORMALIZE) t = t.replace(re, to);
  return norm(t);
}

// Le frasi fisse di un MODEL_X del sorgente: i template literal di ogni
// addArticle, spezzati sui `${…}` e sui paragrafi.
function fragmentsOf(modelConst) {
  const start = src.indexOf('const ' + modelConst + ' = {');
  const end = src.indexOf('\n  };', start);
  if (start < 0 || end < 0) throw new Error(modelConst + ' non trovato');
  const block = src.slice(start, end);
  const out = [];
  const re = /`((?:[^`\\]|\\.)*)`/g; let m;
  while ((m = re.exec(block))) {
    const lit = m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\`/g, '`');
    lit.split(/\$\{[^}]*\}/).join('\n').split(/\n+/).forEach(piece => {
      const t = norm(piece.replace(/^[\s,.:;()]+|[\s,.:;()]+$/g, ''));
      if (t.length >= 40) out.push(t);
    });
  }
  return out;
}
function verify(label, modelConst, files) {
  const models = files.map(modelText);
  const frags = fragmentsOf(modelConst);
  const missing = frags.filter(f => !VARIANTS.some(v => f.startsWith(v)) && !models.some(m => m.includes(f)));
  check(`${label}: ${frags.length} frasi fisse, tutte nel modello (${files.join(' + ')})`, frags.length > 20 && missing.length === 0,
    missing.map(x => '«' + x.slice(0, 110) + '…»').join('\n      '));
  return { frags, missing, models };
}

console.log('\n── Allegato A — 3+2 (contratto_tipo_32_Roma_2023.doc) ──');
// L'art. 5 senza cedolare del 3+2 e' la stessa clausola dell'associazione
// del modello studenti SENZA_CEDOLARE (il 3+2 non ha una sua variante).
const A = verify('MODEL_A', 'MODEL_A', ['contratto_tipo_32_Roma_2023.doc', 'contratto_tipo_STUDENTI_Roma_2023_SENZA_CEDOLARE.doc']);
check('A: la durata e\' quella del modello (3 anni + proroga di diritto di due anni, disdetta sei mesi)',
  A.frags.some(f => f.includes('prorogato di diritto di due anni')) && A.frags.some(f => f.includes('almeno sei mesi prima')));
check('A: oneri accessori sull\'allegato 5 dell\'Accordo (non l\'allegato D del decreto)', A.frags.some(f => f.includes(norm("allegato 5 all'Accordo territoriale"))) && !A.frags.some(f => f.includes('allegato d al decreto')));
check('A: nessuna "natura transitoria" e nessun corso di studi', !A.frags.some(f => /natura transitoria|corso di studi/i.test(f)));

console.log('\n── Allegato C — studenti (STUDENTI.doc + SENZA_CEDOLARE.doc per l\'art. 6) ──');
const C = verify('MODEL_C', 'MODEL_C', ['contratto_tipo_STUDENTI_Roma_2023.doc', 'contratto_tipo_STUDENTI_Roma_2023_SENZA_CEDOLARE.doc']);
check('C: l\'art. 6 senza cedolare porta l\'Istat al 75% (il testo a mano lo ometteva)',
  C.frags.some(f => f.startsWith(norm("Il canone sarà adeguato annualmente con l'applicazione dell'Istat al 75%"))));
check('C: "sono a carico", non "saranno" (la parola che divergeva dal modello)', !C.frags.some(f => f.includes('saranno a carico')));

console.log('\n── Mutazione: il confronto morde ──');
{
  const m = A.models[0];
  check('una frase inventata non sta nel modello', !m.includes(norm('la tassa di registro è ripartita al 50% tra le parti')) && !m.includes(norm('saranno a carico del conduttore')));
  check('il lettore legge davvero il .doc (titolo, protocollo, 15 articoli)', m.includes(norm('LA LOCAZIONE È REGOLATA DALLE PATTUIZIONI SEGUENTI')) && m.includes('ra/2023/0044852') && m.includes(norm('Articolo 15 (Varie)')));
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}verbatim: ${pass} pass, ${fail} fail\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mLe clausole sono quelle del modello — misurato, non dichiarato.\x1b[0m');
