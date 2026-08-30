// tests/scalo/run.mjs — LO SCALO, primo lotto (STUDIO_AVIATION_2026-08.md).
//
// Giunzioni asserite sulla SORGENTE, alla maniera di mobile/desktop/finish:
// le regole che rendono la metafora onesta devono STARE nel file servito,
// non nella memoria di chi l'ha scritta.
//
//   pass-delivery — la carta d'imbarco dice la verità:
//     · il pass viewing viaggia per NAVIGAZIONE VERA su /api/viewings/pass
//       (mai blob: — iOS Safari non lo consegna a Wallet);
//     · una visita ANNULLATA (meta.voided) spegne il bottone Wallet e lo
//       dice — un pass valido per una visita cancellata è una bugia;
//     · una visita NON ANCORA CONFERMATA (meta.when assente) è standby:
//       niente carta spacciata per emessa (la regola di availability-ui);
//     · il codice di rotta esce SOLO dal lessico curato (fallback null,
//       mai inventato al volo — la disciplina di inferZone);
//     · l'emissione è PURO CSS: la pagina vive anche senza JS;
//     · l'oro è quello dello scalo (#FFD700), non il #D4AF37 del portal.
//
//   board — gli ARRIVI sono derivati, mai inventati:
//     · la separazione viene dal DATO che c'era già (ora === 'NOW');
//     · una riga in arrivo dichiara SOON e veste .presto (oro);
//     · la prima stampa e la rotazione leggono dalle PAGES (entrambi i
//       lati nel giro), e le pagine sono TUTTE le pagine.
//
// node tests/scalo/run.mjs

import { readFileSync } from 'node:fs';

const passSrc = readFileSync(new URL('../../pass-delivery.html', import.meta.url), 'utf8');
const boardSrc = readFileSync(new URL('../../board.html', import.meta.url), 'utf8');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.log('  ✗ ' + name); }
}

/* ── pass-delivery: la carta dice la verità ────────────────────────────── */

check('viewing: il pass parte da /api/viewings/pass (navigazione vera)',
  passSrc.includes("'/api/viewings/pass?id='") &&
  passSrc.includes('window.location.href = passHref'));

check('viewing: il mockup legge il record vero (&meta=1)',
  passSrc.includes("passHref + '&meta=1'"));

// il blob resta SOLO nel flusso legacy (generate-pass): nel ramo viewing
// non deve comparire — si isola il blocco `if (passType === 'viewing'...)`
{
  const a = passSrc.indexOf("if (passType === 'viewing' && passId)");
  const b = passSrc.indexOf('async function addToWallet');
  const viewingBlock = a >= 0 && b > a ? passSrc.slice(a, b) : '';
  check('viewing: nessun blob: nel ramo live (solo nel legacy)',
    viewingBlock !== '' && !viewingBlock.includes('createObjectURL'));
}

// visita annullata → carta spenta e bottone disabilitato, DETTO in pagina
{
  const i = passSrc.indexOf('if (m.voided)');
  const j = passSrc.indexOf('} else if (!m.when)');
  const blocco = i >= 0 && j > i ? passSrc.slice(i, j) : '';
  check('voided: il bottone Wallet si spegne', blocco.includes("setAttribute('disabled'"));
  check('voided: la pagina lo dice (CANCELLED)', blocco.includes('CANCELLED'));
}

// visita non confermata → standby onesto: la carta non è "emessa"
{
  const i = passSrc.indexOf('} else if (!m.when)');
  const blocco = i >= 0 ? passSrc.slice(i, i + 700) : '';
  check('pending: senza orario confermato il Wallet non si offre',
    blocco.includes("setAttribute('disabled'"));
  check('pending: lo standby è dichiarato', blocco.includes('STANDBY'));
}

// il codice di rotta: solo lessico curato, ambiguo → niente
check('rotta: lessico ZONE_CODES presente', passSrc.includes('ZONE_CODES'));
{
  const i = passSrc.indexOf('function zoneCode');
  const fn = i >= 0 ? passSrc.slice(i, i + 400) : '';
  check('rotta: nessun match → null, mai un codice inventato',
    fn.includes('return null'));
}

// modalità video: la rotta dice la verità (YOU → LIVE), mai un gate
check('video: la rotta diventa YOU → LIVE',
  passSrc.includes("set('r-from', 'YOU')") && passSrc.includes("set('r-dest', 'LIVE')"));

// l'emissione vive senza JS (CSS puro) e si ferma con reduced-motion
check('emissione: keyframes CSS (la pagina vive senza JS)',
  passSrc.includes('@keyframes emissione'));
check('reduced-motion: la carta è semplicemente lì',
  /prefers-reduced-motion[\s\S]*?\.carta\{transform:none\}/.test(passSrc));

// il messaggio dei link legacy scaduti resta (audit 2026-08 S1)
check('legacy 401: il cliente sa cosa fare',
  passSrc.includes('Link expired — ask BOOM for a fresh one'));

// la palette è quella dello scalo
check('palette: FFD700, mai il #D4AF37 del portal',
  passSrc.includes('#FFD700') && !passSrc.toUpperCase().includes('#D4AF37'));

/* ── board: gli ARRIVI derivati dal dato, mai inventati ────────────────── */

check('split: PARTENZE = ora === NOW (dal dato esistente)',
  boardSrc.includes("CASE.filter(function (h) { return h.ora === 'NOW'; })"));
check('split: ARRIVI = il complemento, stesso dato',
  boardSrc.includes("CASE.filter(function (h) { return h.ora !== 'NOW'; })"));

// una riga in arrivo dichiara SOON (mai lo stato del lato partenze)
check('arrivi: stato SOON derivato', boardSrc.includes("stato:'SOON'"));
check('arrivi: la riga veste .presto', boardSrc.includes('presto:true'));
check('arrivi: .presto è oro (CSS emesso davvero)',
  boardSrc.includes('.riga.presto .c-stato'));

// il tabellone gira su PAGES (entrambi i lati), non più su CASE nudo
check('rotazione: pagine = PAGES.length', boardSrc.includes('var pagine = PAGES.length'));
check('rotazione: mostra() legge PAGES[p]', boardSrc.includes('PAGES[p].rows[i]'));
check('prima stampa: legge PAGES[0]', boardSrc.includes('PAGES[0].rows[i]'));

// il lato è un organo Solari vero e si aggiorna col giro
check('lato: DEPARTURES/ARRIVALS su ante',
  boardSrc.includes('DEPARTURES') && boardSrc.includes('ARRIVALS') &&
  boardSrc.includes('lato.update(PAGES[p].lato)'));

// il fallback statico del lato esiste anche senza JS (markup, non solo JS)
check('lato: parola nel markup (degrado no-JS)',
  boardSrc.includes('id="lato" class="flap-scale">DEPARTURES'));

/* ── esito ─────────────────────────────────────────────────────────────── */
if (failed) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
