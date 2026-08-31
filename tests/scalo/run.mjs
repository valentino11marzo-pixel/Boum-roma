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
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const passSrc = readFileSync(new URL('../../pass-delivery.html', import.meta.url), 'utf8');
const boardSrc = readFileSync(new URL('../../board.html', import.meta.url), 'utf8');
const viewSrc = readFileSync(new URL('../../viewing.html', import.meta.url), 'utf8');
const bookSrc = readFileSync(new URL('../../book.html', import.meta.url), 'utf8');
const casaSrc = readFileSync(new URL('../../tenant.html', import.meta.url), 'utf8');
const detSrc = readFileSync(new URL('../../apartment-detail.html', import.meta.url), 'utf8');
const SC = require('../../js/scalo-codes.js');

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

// il codice di rotta viene dal modulo CONDIVISO — pass-delivery non ha
// più una copia propria del lessico (la disciplina "una copia sola")
check('rotta: pass-delivery carica js/scalo-codes.js',
  passSrc.includes('src="/js/scalo-codes.js"'));
check('rotta: nessuna copia privata del lessico in pagina',
  !passSrc.includes('ZONE_CODES ='));
check('rotta: senza modulo o senza match, nessun codice inventato',
  passSrc.includes('return SC ? SC.zoneCode(txt) : null'));

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

/* ── il lessico condiviso (js/scalo-codes.js) — motore puro, si testa ──── */

check('lessico: la zona nota ha il suo codice', SC.zoneCode('Trastevere Loft') === 'TRA');
check('lessico: l\'alias lungo batte il corto contenuto (radar lesson)',
  SC.zoneCode('zona Monti Tiburtini') === 'TIB');
check('lessico: MONTI da solo resta MON', SC.zoneCode('Monti') === 'MON');
check('lessico: MONTEVERDE non è MONTI (parole intere)',
  SC.zoneCode('Monteverde Vecchio') === 'MTV');
check('lessico: ambiguo/sconosciuto → null, MAI inventato',
  SC.zoneCode('zona sconosciuta') === null && SC.zoneCode('') === null && SC.zoneCode(null) === null);
check('lessico: il match ignora il case', SC.zoneCode('pigneto palace') === 'PIG');
check('volo: bmCode è derivato e deterministico',
  SC.bmCode('a1B2c3d4e5') === 'BM A1B2' && SC.bmCode('a1B2c3d4e5') === SC.bmCode('a1B2c3d4e5'));
check('volo: senza id niente numero', SC.bmCode('') === null && SC.bmCode(null) === null);

/* ── viewing.html (W1): il flight status dice solo ciò che è vero ──────── */

check('viewing: carica il lessico condiviso',
  viewSrc.includes('src="/js/scalo-codes.js"'));
check('viewing: il countdown usa i momenti VERI di _moments (24h/3h/30m)',
  viewSrc.includes('when-24*3600e3') && viewSrc.includes('when-3*3600e3') &&
  viewSrc.includes('when-30*60e3'));
check('viewing: il countdown esiste SOLO su confermata/completata con orario',
  viewSrc.includes("(st==='confirmed'||st==='completed')&&v.when"));
check('viewing: video → YOU → LIVE (mai un gate per una call)',
  viewSrc.includes("from='YOU';dst='LIVE'"));
check('viewing: il numero di volo è bmCode(id), derivato',
  viewSrc.includes('SC.bmCode(v.id)'));
check('viewing: lo stato del countdown è temporale, mai "email inviata"',
  !/email (inviata|sent)/i.test(viewSrc.slice(viewSrc.indexOf('tkCount'))));

/* ── book.html (S3): il check-in, con le promesse intatte ──────────────── */

check('book: carica il lessico condiviso',
  bookSrc.includes('src="/js/scalo-codes.js"'));
check('book: applyApprovalCopy resta l\'UNICO posto delle parole',
  bookSrc.includes('function applyApprovalCopy()') &&
  bookSrc.includes("bl.textContent='Request this viewing →'"));
// la carta d'imbarco vive SOLO nella schermata confermata: una richiesta
// pending resta "Request sent" — un pass su una visita non confermata è
// una bugia (la regola di availability-ui, qui sul client)
{
  const pendStart = bookSrc.indexOf('id="pend-body"');
  const confStart = bookSrc.indexOf('id="conf-body"');
  const pendBlock = bookSrc.slice(pendStart, confStart);
  check('book: nessuna carta d\'imbarco nella schermata pending',
    pendStart > 0 && confStart > pendStart && !pendBlock.includes('cdi'));
  check('book: la carta vive nella schermata confermata',
    bookSrc.slice(confStart).includes('class="cdi"'));
}
check('book: la rotta usa il lessico condiviso, fallback HOME',
  bookSrc.includes("SC.zoneCode((data.listingZone||'')+' '+(data.listingName||'')))||'HOME'"));
check('book: video → YOU → LIVE anche qui',
  bookSrc.includes("set('conf-from',video?'YOU':'ROM')"));
check('book: gli id che showConfirmed scrive esistono ancora',
  bookSrc.includes('id="conf-prop"') && bookSrc.includes('id="conf-time"') &&
  bookSrc.includes('id="conf-name"') && bookSrc.includes('id="conf-code"'));

/* ── board, S4-full: l'idrante legge il catalogo VERO col motore vero ──── */

check('idrante: il board carica il motore delle corsie (dispo-engine)',
  boardSrc.includes('src="/js/dispo-engine.js"'));
check('idrante: stessa porta della vetrina (REST pubblico listings)',
  boardSrc.includes('firestore.googleapis.com') && boardSrc.includes('listings?pageSize=300'));
check('idrante: le corsie escono SOLO da marketLane, mai da un parser locale',
  boardSrc.includes('D.marketLane({') && boardSrc.includes('if (!D || !D.marketLane) return null'));
check('idrante: la corsia closed non sale sul tabellone',
  boardSrc.includes("m.lane === 'closed') return"));
check('idrante: la data ILLEGGIBILE dice ASK, mai NOW (regola 1 di dispo)',
  /m\.dateUnreadable\)\s*\{[^}]*'ASK'/.test(boardSrc));
check('idrante: l\'ETA degli arrivi viene dall\'iso del motore',
  boardSrc.includes('m.iso.slice(8, 10)') && boardSrc.includes("riga.stato = 'SOON'"));
check('idrante: arrivi in ordine di ETA (daysOut del motore)',
  boardSrc.includes('riga._d = m.daysOut'));
check('idrante: fail-open — rete giù, resta la fotografia di build',
  boardSrc.includes('.catch(function () {})') &&
  /var PAGES = buildPages\(\s*CASE\.filter/.test(boardSrc));
check('idrante: mai una pagina fantasma (un lato vuoto non gira)',
  boardSrc.includes('if (!pages.length) pages.push'));

/* ── /casa, S6: la rotta è fatta di FATTI ──────────────────────────────── */

check('casa: senza contratto (startDate) la rotta non esiste',
  casaSrc.includes("if(!c||!c.startDate)return ''"));
check('casa: la firma è signatureStatus, non una stima',
  casaSrc.includes("done:c.signatureStatus==='completed'"));
check('casa: il saldo deposito esiste SOLO se il deal l\'ha spezzato',
  casaSrc.includes('if(depBal)st.push') &&
  casaSrc.includes("done:depBal.status==='paid'"));
check('casa: chiavi = la decorrenza vera del contratto',
  casaSrc.includes('done:c.startDate<=todayISO,d:c.startDate'));
check('casa: il rinnovo è endDate−90 — il T-90 del journey server',
  casaSrc.includes('d.setDate(d.getDate()-90)'));
check('casa: l\'aereo sta sulla prima tappa NON compiuta',
  casaSrc.includes('if(!st[i].done){idx=i;break}'));
check('casa: la rotta entra dopo le tiles, dentro render()',
  casaSrc.includes('+rottaCasa(c,depBal);'));
check('casa: le tappe parlano entrambe le lingue',
  (casaSrc.match(/jSign:/g) || []).length === 2 &&
  (casaSrc.match(/jRen:/g) || []).length === 2);

/* ── apartment-detail, S5: il timbro dice un fatto avvenuto ────────────── */

check('timbro: il claim vero della pagina, battuto come sigillo',
  detSrc.includes('timbro-walk') && detSrc.includes('Walked by BOOM ✓'));
check('timbro: visibile SEMPRE — l\'animazione è solo il colpo (.giu)',
  !/\.timbro-walk\s*\{[^}]*opacity\s*:\s*0/.test(detSrc) &&
  detSrc.includes('.timbro-walk.giu { animation:timbrata'));
check('timbro: batte UNA volta (l\'observer si stacca)',
  detSrc.includes('iot.disconnect()'));
check('timbro: con reduced-motion resta stampato, fermo',
  /prefers-reduced-motion:reduce\)\{ \.timbro-walk\.giu \{ animation:none/.test(detSrc));

/* ── esito ─────────────────────────────────────────────────────────────── */
if (failed) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
