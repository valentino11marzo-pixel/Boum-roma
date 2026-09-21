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


// ── DIREZIONE INVERSA (21/09/2026): modello → generatore ─────────────────
// Il confronto sopra prende le frasi dal SORGENTE e le cerca nel .doc. Non
// vede due cose: una frase del modello che il PDF NON stampa, e un testo
// scritto a mano che entra nell'articolo da una funzione di aiuto fuori dal
// blocco MODEL_* (impiantiClause, oneriClause, il default di consegnaStato —
// tre casi veri, trovati proprio così). Qui si IMPAGINA davvero, con un
// jsPDF finto che registra ogni doc.text (nessuna dipendenza: gira anche in
// CI senza node_modules), su più varianti di contratto, e si pretende che
// OGNI frase del .doc — spezzata sugli slot del modulo — stia nell'uscita di
// almeno una variante. Gli slot che il dato riempie sono ELENCATI, non
// impliciti.
import CP from '../../js/contract-pdf.js';
function fakePdf() {
  const out = []; let pages = 1;
  return {
    setFont() {}, setFontSize() {}, setLineHeightFactor() {}, setLineWidth() {}, setDrawColor() {}, setTextColor() {}, line() {}, addImage() {}, setPage() {},
    addPage() { pages++; }, splitTextToSize(t) { return [String(t)]; },
    text(t) { out.push(Array.isArray(t) ? t.join(' ') : String(t)); },
    internal: { getCurrentPageInfo() { return { pageNumber: pages }; }, getNumberOfPages() { return pages; } },
    output() { return new ArrayBuffer(8); }, __out: out,
  };
}
function render(contract, property) {
  const d = fakePdf();
  CP.build({ jsPDF: function () { return d; }, contractId: 'c1', contract, property });
  return d.__out.join('\n');
}
const normDash = (s) => norm(String(s).replace(/[—–]/g, ' '));
// Un contratto studenti realistico: 10 mesi, cedolare, deposito, dati completi.
const PROP = { address: 'Via Test 1', floor: '2', interno: '5', rooms: '3', city: 'Roma', furnished: true, cadastralData: 'foglio 1 particella 2 sub 3 cat A/2', energyClass: 'E' };
const C_BASE = {
  type: 'studenti', landlordName: 'Mario Rossi', landlordCF: 'RSSMRA70A01H501U', landlordDob: '1970-01-01', landlordPob: 'Roma', landlordAddress: 'Via Roma 1, Roma',
  tenantName: 'John Smith', tenantCF: 'SMTJHN00A01Z404X', tenantDob: '2000-01-01', tenantPob: 'London', tenantDocType: 'passport', tenantDocNum: 'AB123', tenantDocIssuer: 'HMPO', tenantDocIssueDate: '2020-01-01',
  startDate: '2026-10-01', endDate: '2027-07-31', rent: 1000, deposit: 2000, installmentMonths: 1, paymentDay: 5, cedolareSecca: 'si',
  studenti: { corsoStudi: 'Laurea in Economia', universita: 'LUISS' }, cohabitants: '', otherClauses: '',
};
const C_VARIANTS = {
  'default 10 mesi': render(C_BASE, PROP),
  'cedolare off': render({ ...C_BASE, cedolareSecca: 'no' }, PROP),
  '12 mesi': render({ ...C_BASE, endDate: '2027-09-30' }, PROP),
  'impianti conformi': render(C_BASE, { ...PROP, impiantiStato: 'conformi' }),
  'impianti funzionanti': render(C_BASE, { ...PROP, impiantiStato: 'funzionanti' }),
  'oneri quota': render({ ...C_BASE, oneriQuota: 50 }, PROP),
  'oneri inclusi': render({ ...C_BASE, condoMode: 'incluso' }, PROP),
  'rate trimestrali': render({ ...C_BASE, installmentMonths: 3, installmentAmount: 3000 }, PROP),
  'senza deposito': render({ ...C_BASE, deposit: 0 }, PROP),
};
const A_BASE = { ...C_BASE, type: '3+2', endDate: '2029-09-30', studenti: null };
const A_VARIANTS = {
  'default': render(A_BASE, PROP),
  'cedolare off': render({ ...A_BASE, cedolareSecca: 'no' }, PROP),
  'impianti conformi': render(A_BASE, { ...PROP, impiantiStato: 'conformi' }),
  'senza deposito': render({ ...A_BASE, deposit: 0 }, PROP),
};
// Gli SLOT del modulo che il dato riempie (o le scelte barrate a mano sulla
// carta): la frase del .doc non può comparire tale e quale, ed è giusto così.
const SLOTS = [
  /identificato\/a mediante c i\/patente auto/,           // tipo di documento dal dato
  /elementi accessori soffitta cantina autorimessa/,      // l'elenco da barrare → gli accessori veri o «—»
  /bonifico bancario ovvero$/,                            // «ovvero --»: la terza modalità, vuota
  /dispongono\/non dispongono/,                           // la scelta del 3+2 → una delle due
  /^articolo 13 accessi$/,                                // refuso del modello: il secondo 13 è il 14
];
function modelSentences(file) {
  let t = docText(readFileSync(R('../../reference/' + file)));
  for (const [re, to] of NORMALIZE) t = t.replace(re, to);
  t = t.replace(/Pagamепto/g, 'Pagamento').replace(/Articolo l \(/g, 'Articolo 1 (');
  const out = [];
  t.split('\n').map(x => x.trim()).filter(Boolean)
    .flatMap(l => l.split(/(?<=[.;:])\s+(?=[A-ZÈ"“])/))
    .forEach(sen => sen.split(/_{2,}|--|\(\s*_*\/00\)|€\s*_*,00|n°|\bn\.\s*_+/)
      .map(f => normDash(f.replace(/^[\s,.:;()]+|[\s,.:;()]+$/g, '')))
      .filter(f => f.length >= 18).forEach(f => out.push(f)));
  return out;
}
function reverse(label, file, variants) {
  const outs = Object.values(variants).map(normDash);
  const frags = modelSentences(file);
  const missing = frags.filter(f => !SLOTS.some(re => re.test(f)) && !outs.some(o => o.includes(f)));
  check(`${label}: ${frags.length} frasi del modello, tutte stampate da almeno una variante (${Object.keys(variants).length} varianti)`, frags.length > 60 && missing.length === 0,
    missing.map(x => '«' + x.slice(0, 110) + '…»').join('\n      '));
}
console.log('\n── Direzione inversa: ogni frase del .doc esce dal PDF ──');
reverse('C', 'contratto_tipo_STUDENTI_Roma_2023.doc', C_VARIANTS);
reverse('C senza cedolare (art. 6)', 'contratto_tipo_STUDENTI_Roma_2023_SENZA_CEDOLARE.doc', C_VARIANTS);
reverse('A', 'contratto_tipo_32_Roma_2023.doc', A_VARIANTS);

console.log('\n── Le funzioni di aiuto non scavalcano più il modello ──');
{
  const def = normDash(C_VARIANTS['default 10 mesi']);
  const model = modelText('contratto_tipo_STUDENTI_Roma_2023.doc');
  check('C) SICUREZZA IMPIANTI senza dichiarazione = la frase del modello («non dispongono di certificazione a norma»), mai «funzionanti e idonei»',
    def.includes(norm('Il conduttore prende atto che gli impianti esistenti nell’appartamento in oggetto e quelli condominiali non dispongono di certificazione a norma')) && !def.includes('funzionanti e idonei'));
  check('… e la vecchia frase inventata NON sta nel modello (il confronto l’avrebbe presa)', !model.includes(norm('Le parti danno atto che gli impianti presenti nell’unità immobiliare sono funzionanti e idonei')));
  check('impianti conformi → «dispongono» (l’alternativa che il modello 3+2 scrive); «funzionanti» dichiarato → frase del modello + la dichiarazione, variante dichiarata',
    normDash(C_VARIANTS['impianti conformi']).includes(norm('condominiali dispongono di certificazione a norma')) && !normDash(C_VARIANTS['impianti conformi']).includes('non dispongono')
    && normDash(C_VARIANTS['impianti funzionanti']).includes('non dispongono di certificazione') && normDash(C_VARIANTS['impianti funzionanti']).includes(norm('Il locatore dichiara altresì che gli impianti sono funzionanti')));
  check('art. 5 Oneri: chiusa del modulo «versa una quota di € -- salvo conguaglio» (mai «regolate a consuntivo secondo la Tabella…»)',
    def.includes(norm('Per le spese di cui al presente articolo il conduttore versa una quota di € -- salvo conguaglio')) && !def.includes('regolate a consuntivo secondo la tabella'));
  check('art. 5 Oneri con acconto → «€ 50 al mese salvo conguaglio»; compresi nel canone → variante dichiarata',
    normDash(C_VARIANTS['oneri quota']).includes(norm('versa una quota di € 50 al mese salvo conguaglio')) && normDash(C_VARIANTS['oneri inclusi']).includes('comprese nel canone'));
  check('art. 10 Consegna: «di quanto segue: -- ovvero di quanto risulta dal verbale di consegna» — non più la stessa frase due volte',
    def.includes(norm('di quanto segue: -- ovvero di quanto risulta dal verbale di consegna')) && !def.includes('sottoscritto alla consegna delle chiavi'));
  check('art. 3 Canone, cadenza mensile = la riga del modulo («rate eguali anticipate … entro il 5 di ogni mese»)',
    /in n 10 rate eguali anticipate di € 1[ .]?000 1[ .]?000\/00 ciascuna entro il 5 di ogni mese/.test(def) && !def.includes('rate mensili') && !def.includes('entro il giorno'));
  const raw = C_VARIANTS['default 10 mesi'];
  check('intestazioni come sul modello: «Articolo 2 (Natura transitoria)», non «Articolo 2 — …»', raw.includes('Articolo 2 (Natura transitoria)') && !raw.includes('Articolo 2 — '));
  check('durata con la data di fine INCLUSA: 01/10→31/07 = «10 mesi» in art. 1 e art. 3; 01/09→31/08 = 12 mesi e «canone annuo»',
    raw.includes('durata di 10 mesi') && raw.includes("intera durata contrattuale di 10 mesi")
    && CP.monthsBetween('2026-09-01', '2027-08-31').text === '1 anno' && CP.monthsBetween('2026-01-15', '2026-07-14').text === '6 mesi' && CP.monthsBetween('2026-10-01', '2027-07-31').text === '10 mesi'
    && render({ ...C_BASE, startDate: '2026-09-01', endDate: '2027-08-31' }, PROP).includes('Il canone annuo di locazione'));
  // I testi fissi delle due funzioni di aiuto stanno nel modello (forward), salvo le varianti dichiarate.
  const HELPER_VARIANTS = ['le spese di cui al presente articolo sono comprese nel canone', 'il locatore dichiara altresì che gli impianti sono funzionanti'];
  const helperTexts = [
    CP.impiantiClauseConcordato({}, {}), CP.impiantiClauseConcordato({ impiantiStato: 'conformi' }, {}), CP.impiantiClauseConcordato({ impiantiStato: 'funzionanti' }, {}),
    CP.oneriClauseConcordato({}, (n) => String(n)), CP.oneriClauseConcordato({ oneriQuota: 50 }, (n) => String(n)), CP.oneriClauseConcordato({ condoMode: 'incluso' }, (n) => String(n)),
  ].flatMap(t => t.split(/(?<=\.)\s+/)).map(norm).filter(t => t.length >= 30);
  const modelA = modelText('contratto_tipo_32_Roma_2023.doc');
  // «€ 50 al mese» occupa lo slot «€ --» del modulo; «dispongono» (conformi) è
  // una delle due scelte che il modello 3+2 scrive come «dispongono/non dispongono».
  const inModel = (t) => model.includes(t) || modelA.includes(t);
  const leaks = helperTexts.filter(t => !HELPER_VARIANTS.some(v => t.startsWith(v))
    && !inModel(t.replace(/\b50 al mese\b/, '--'))
    && !inModel(t.replace(/condominiali dispongono di/, 'condominiali dispongono/non dispongono di')));
  check('le frasi fisse di impiantiClauseConcordato/oneriClauseConcordato stanno nel modello (varianti dichiarate escluse)', leaks.length === 0, leaks.join('\n      '));
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}verbatim: ${pass} pass, ${fail} fail\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mLe clausole sono quelle del modello — misurato, non dichiarato.\x1b[0m');
