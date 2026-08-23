// tests/prenota/run.mjs — LA CORSIA DEL PRE-BLOCCO.
//
// LA SCOPERTA DEL 23 AGOSTO 2026. Il catalogo vero porta 26 case: dieci
// `available`, NOVE `waitlist`, sette `rented`. Le nove waitlist sono le
// case BLOCCATE — occupate oggi, con la data di rilascio scritta sul
// documento — e ogni superficie buttava via quella data: la vetrina
// diceva «Waitlist open», la scheda «the moment it frees up», llms
// «currently occupied», il JSON-LD dichiarava `InStock` una casa con
// dentro un inquilino. Il dato più prezioso — IL GIORNO in cui entri —
// non arrivava mai al cliente che sta programmando un trasferimento.
//
// Qui si pinna la corsia commerciale derivata (now / ahead / closed) e
// le sue quattro regole dure, quelle che decidono se una promessa è
// mantenibile:
//
//   A  `waitlist` è sempre prenotabile — è la dichiarazione dell'operatore
//   B  `available` con data futura è ahead, non «libera ora» (sana da sola
//      il disallineamento vero: il Bilocale Prati era available + 2027
//      mentre l'operatore lo considerava bloccato)
//   C  `rented` si prenota SOLO con availableFrom (la data che scrive il
//      contratto alla firma), MAI con la sola availableDate — testo libero
//      che su una casa affittata è quasi sempre il residuo di quando era
//      libera: nel catalogo vero 6 rented su 7 la portano già PASSATA
//   D  una data illeggibile non promette niente: né «libera ora» né una
//      prenotazione (regola 1 di dispo-engine, qui applicata alla corsia)
//
// Più le giunzioni: JSON-LD PreOrder, il Segugio che finalmente guarda la
// data di ingresso richiesta, il feed che pubblica ciò che si può davvero
// affittare. Le regole si verificano PER MUTAZIONE dove contano.

import DISPO from '../../js/dispo-engine.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OGGI = '2026-08-23';

let pass = 0, fail = 0;
function check(name, fn) {
  try {
    const v = fn();
    if (v) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name); }
  } catch (e) {
    fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message ? e.message.split('\n')[0] : e));
  }
}
const lane = (l) => DISPO.marketLane(l, OGGI);
const copy = (l, lang) => DISPO.laneCopy(DISPO.marketLane(l, OGGI), lang, OGGI);
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

console.log('\nLA CORSIA — chi si può prenotare in anticipo, e chi no');

// ── REGOLA A — waitlist è la dichiarazione dell'operatore ───────────────
check('A · waitlist con data → prenotabile, con la DATA (non «lista d\'attesa»)', () => {
  const m = lane({ status: 'waitlist', availableDate: '1 Jan 2027' });
  return m.lane === 'ahead' && m.iso === '2027-01-01' && m.bookable === true
    && copy({ status: 'waitlist', availableDate: '1 Jan 2027' }).short === 'Free from 1 Jan 2027';
});
check('A · waitlist SENZA data resta prenotabile (promessa più debole, non zero)', () => {
  const m = lane({ status: 'waitlist' });
  const c = copy({ status: 'waitlist' });
  return m.lane === 'ahead' && m.iso === null && /Reserve ahead/.test(c.short);
});
check('A · il verbo del bottone è BLOCCARE, non candidarsi', () => {
  const c = copy({ status: 'waitlist', availableDate: '1 Jan 2027' });
  return /^Reserve from 1 Jan 2027$/.test(c.cta)
    && copy({ status: 'available' }).cta === 'Apply';
});

// ── REGOLA B — available con data futura non è «libera ora» ─────────────
check('B · available + data futura → ahead (il caso Bilocale Prati)', () => {
  const l = { status: 'available', availableDate: '1 Sept 2027' };
  const m = lane(l);
  return m.lane === 'ahead' && m.iso === '2027-09-01'
    && copy(l).short === 'Free from 1 Sep 2027';
});
check('B · available + data PASSATA → libera adesso', () => {
  const m = lane({ status: 'available', availableDate: '2026-06-01' });
  return m.lane === 'now' && m.iso === null;
});
check('B · available senza data → libera adesso', () =>
  lane({ status: 'available' }).lane === 'now'
  && copy({ status: 'available' }).short === 'Available now');

// ── REGOLA C — sull'affittata ci si fida SOLO del contratto ─────────────
check('C · rented + availableFrom (dal contratto) → prenotabile', () => {
  const m = lane({ status: 'rented', availableFrom: '2027-03-01' });
  return m.lane === 'ahead' && m.iso === '2027-03-01' && m.source === 'availableFrom';
});
check('C · rented + SOLA availableDate futura → NON si prenota (residuo, non promessa)', () => {
  const m = lane({ status: 'rented', availableDate: '2027-03-01' });
  return m.lane === 'closed' && m.iso === null && m.bookable === false
    && /non dal contratto/.test(m.why);
});
check('C · rented con availableDate passata (6 casi su 7 nel catalogo vero) → chiusa', () =>
  lane({ status: 'rented', availableDate: '2026-06-01' }).lane === 'closed');
check('C · rented nudo → chiuso, e lo dice', () => {
  const m = lane({ status: 'rented' });
  return m.lane === 'closed' && /senza data/.test(m.why);
});

// ── REGOLA D — l'illeggibile non promette ──────────────────────────────
check('D · data illeggibile su available → «Ask us», MAI «Available now»', () => {
  const l = { status: 'available', availableDate: 'da concordare' };
  const m = lane(l);
  return m.lane === 'now' && m.dateUnreadable === true
    && copy(l).short === 'Ask us for the date';
});
check('D · e non diventa nemmeno una prenotazione con data', () => {
  const m = lane({ status: 'available', availableDate: 'quando si libera' });
  return m.iso === null;
});
check('D · nessun testo ≠ testo illeggibile (il primo è il caso normale)', () =>
  lane({ status: 'available' }).dateUnreadable === false);

// ── ogni corsia sa dire PERCHÉ (la lezione dei veti del Richiamo) ───────
check('ogni verdetto porta il suo motivo', () =>
  ['waitlist', 'available', 'rented', 'reserved'].every((s) => {
    const w = lane({ status: s, availableDate: '1 Jan 2027' }).why;
    return typeof w === 'string' && w.length > 8;
  }));
check('daysOut conta i giorni veri fino all\'ingresso', () =>
  lane({ status: 'waitlist', availableDate: '2026-09-02' }).daysOut === 10);

// ── italiano ───────────────────────────────────────────────────────────
check('le parole esistono in italiano e non ricadono sull\'inglese', () => {
  // il mese esteso è la convenzione di fmtDate (già in uso da label e dal
  // feed): il test la PINNA invece di imporne una nuova
  const c = copy({ status: 'waitlist', availableDate: '1 Jan 2027' }, 'it');
  return c.short === 'Libera dal 1 gennaio 2027'
    && c.cta === 'Blocca dal 1 gennaio 2027'
    && /Occupata adesso/.test(c.long);
});

// ── label() non perde più la data (era il difetto nel motore stesso) ────
check('label() su una waitlist dice la DATA, non «rents ahead»', () => {
  const t = DISPO.label({ status: 'waitlist', availableDate: '1 Jan 2027' }, 'en', OGGI).text;
  return /1 Jan 2027/.test(t) && !/rents ahead/.test(t);
});

// ── IL CATALOGO VERO: nessuna casa perde la corsia ─────────────────────
console.log('\nIL CATALOGO — le forme vere dei documenti in produzione');
const VERI = [
  ['Bilocale Prati', { status: 'available', availableDate: '1 Sept 2027' }, 'ahead'],
  ['Bilocale Centro', { status: 'waitlist', availableDate: '2027-01-31' }, 'ahead'],
  ['Ripetta Terrace', { status: 'waitlist', availableDate: 'Sep 2026' }, 'ahead'],
  ['Coronari Classic', { status: 'waitlist', availableDate: 'Mar 1' }, 'ahead'],
  ['Bilocale Trastevere', { status: 'available', availableDate: '2026-07-01' }, 'now'],
  ['Bilocale Flaminio', { status: 'rented', availableDate: '2026-06-01' }, 'closed'],
  ['Bilocale Centro (rented)', { status: 'rented', availableDate: '2026-09-01' }, 'closed'],
];
for (const [nome, doc, atteso] of VERI) {
  check(`${nome} → ${atteso}`, () => lane(doc).lane === atteso);
}
check('nessuna casa bloccata resta senza parole', () =>
  VERI.filter((v) => v[2] === 'ahead')
    .every(([, d]) => (copy(d).short || '').length > 4 && copy(d).cta));

// ── L'ANNO CHE NESSUNO HA SCRITTO ──────────────────────────────────────
// 10 case su 26 hanno la data senza anno: il motore sceglie il futuro
// (regola 2), ma deve DIRE che l'ha scelto lui — altrimenti «Free from 1
// Jul 2027» su una casa che l'operatore intendeva libera dal luglio
// scorso manda via chi poteva entrare domani, e nessuno lo scopre mai.
console.log('\nL\'ANNO DEDOTTO — la scelta prudente si dichiara');
check('anno assente → yearGuessed acceso, e la data va avanti (mai indietro)', () => {
  const m = lane({ status: 'waitlist', availableDate: '1 July' });
  return m.yearGuessed === true && m.iso === '2027-07-01';
});
check('anno scritto → yearGuessed spento (è un fatto, non una scelta)', () =>
  lane({ status: 'waitlist', availableDate: '1 Sept 2026' }).yearGuessed === false);
check('ISO puro → mai indovinato', () =>
  lane({ status: 'available', availableDate: '2027-01-31' }).yearGuessed === false);
check('l\'audit consegna la lista da confermare, la più lontana in testa', () => {
  const a = DISPO.audit([
    { id: 'a', name: 'Vicina', status: 'waitlist', availableDate: 'Mar 1' },
    { id: 'b', name: 'Lontana', status: 'waitlist', availableDate: '1 Aug' },
    { id: 'c', name: 'Certa', status: 'waitlist', availableDate: '2027-02-01' },
  ], OGGI);
  return a.guessed.length === 2 && a.guessed[0].name === 'Lontana'
    && a.guessed[0].raw === '1 Aug' && a.guessed[0].reads === '2027-08-01';
});
check('l\'audit conta le corsie, che è ciò che l\'operatore vende', () => {
  const a = DISPO.audit([
    { id: 'a', status: 'available' },
    { id: 'b', status: 'waitlist', availableDate: '1 Jan 2027' },
    { id: 'c', status: 'rented' },
  ], OGGI);
  return a.lanes.now === 1 && a.lanes.ahead === 1 && a.lanes.closed === 1;
});
check('il pannello dell\'operatore mostra corsia, avviso e tap di conferma', () => {
  const s = src('js/portal-app.js');
  return /yearGuessed/.test(s) && /l'anno l'abbiamo dedotto noi/.test(s)
    && /Sì, è \$\{esc\(r\.iso\)\}/.test(s) && /si prenotano in anticipo/.test(s);
});
check('la porta di scrittura espone corsia e anno dedotto (bot e portal)', () => {
  const s = src('api/listings-availability.js');
  return /yearGuessed: m\.yearGuessed/.test(s) && /lane: m\.lane/.test(s);
});

// ── LE GIUNZIONI, asserite sulla SORGENTE ──────────────────────────────
console.log('\nLE GIUNZIONI — le superfici leggono la stessa corsia');
check('JSON-LD: PreOrder per le prenotabili, SoldOut solo per le chiuse', () => {
  const s = src('api/listing.js');
  return /schema\.org\/PreOrder/.test(s) && /marketLane/.test(s)
    && /lane === 'closed' \? 'https:\/\/schema\.org\/SoldOut'/.test(s);
});
check('JSON-LD: availabilityStarts solo dalla corsia (mai da un testo qualsiasi)', () =>
  /if \(lane\.iso\) ld\.offers\.availabilityStarts = lane\.iso;/.test(src('api/listing.js')));
check('llms-listings: la riga citabile porta la data di rilascio', () => {
  const s = src('api/llms-listings.js');
  return /reservable ahead — occupied now, free from/.test(s) && /marketLane/.test(s);
});
check('llms-listings: il conteggio «available» conta solo chi entra ORA', () =>
  /marketLane\(l, today\)\.lane === 'now'/.test(src('api/llms-listings.js')));
check('Segugio: la data di ingresso richiesta è finalmente un filtro', () => {
  const s = src('api/search/matcher.js');
  return /c\.moveIn/.test(s) && /iso > c\.moveIn/.test(s);
});
check('Segugio: rentable = corsia, così entra l\'affittata col contratto', () =>
  /marketLane\(l\)\.lane !== 'closed'/.test(src('api/search/matcher.js')));
check('feed portali: publishable legge la corsia, non l\'etichetta', () =>
  /marketLane\(\{[\s\S]{0,120}\}\)\.lane !== 'closed'/.test(src('api/feed/immobiliare.js')));
check('vetrina: il badge passa da laneCopy e riceve i campi GREZZI', () => {
  const s = src('apartments.html');
  return /BOOM_DISPO\.laneCopy/.test(s) && /campi && campi\.af/.test(s);
});
check('scheda: la CTA del pre-blocco viene dal motore, non da una stringa fissa', () => {
  const s = src('apartment-detail.html');
  return /BOOM_DISPO\.laneCopy/.test(s) && !/Join the waitlist/.test(s);
});
check('scheda: una casa con data nota nasce come PRENOTAZIONE, non lista d\'attesa', () => {
  const s = src('apartment-detail.html');
  return /c\.lane === 'ahead' \? 'reserve'/.test(s)
    && /waitlist: !c\.libera && c\.lane !== 'ahead'/.test(s);
});
check('nessuna promessa sui costi dell\'hold nella scheda (il prodotto ha le sue regole)', () =>
  !/never charged/i.test(src('apartment-detail.html')));

// ── LA MUTAZIONE: le regole devono essere VIVE, non decorative ──────────
console.log('\nLA MUTAZIONE — se una regola sparisce, questa suite deve cadere');
check('mutazione C: se l\'affittata si aprisse su availableDate, il test C cade', () => {
  // si simula la regola sbagliata e si pretende che il verdetto cambi
  const buono = lane({ status: 'rented', availableDate: '2027-03-01' }).lane;
  const sbagliato = DISPO.marketLane(
    { status: 'available', availableDate: '2027-03-01' }, OGGI).lane;
  return buono === 'closed' && sbagliato === 'ahead' && buono !== sbagliato;
});
check('mutazione D: «libera ora» e «data illeggibile» non collassano mai', () => {
  const a = copy({ status: 'available' }).short;
  const b = copy({ status: 'available', availableDate: 'boh' }).short;
  return a !== b && /now/i.test(a) && /Ask us/.test(b);
});

console.log(fail
  ? `\nPRENOTA: ${fail} GUASTI su ${pass + fail}`
  : `\nPRENOTA: TUTTO VERDE (${pass} check)`);
process.exit(fail ? 1 : 0);
