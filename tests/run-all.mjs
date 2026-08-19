// tests/run-all.mjs — tutte le suite, un comando.
//
//   npm test                    tutte
//   npm test -- money safari    solo quelle nominate
//
// Le suite che richiedono un browser (safari) si auto-skippano quando
// playwright-core non c'è, così `npm test` gira ovunque senza setup.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SUITES = [
  { name: 'money',    file: 'tests/money/run.mjs',        what: 'percorsi soldi: checkout, webhook, conversione PA' },
  { name: 'fiscal',   file: 'tests/fiscal/test.mjs',      what: 'motore scadenze fiscali' },
  { name: 'canone',   file: 'tests/fiscal/canone.mjs',    what: 'canone concordato: fasce, cap, superficie convenzionale, verdetto' },
  { name: 'taxpack',  file: 'tests/taxpack/test.mjs',     what: 'pacchetto commercialista' },
  { name: 'journey',  file: 'tests/journey/steps.mjs',    what: 'regole commerciali delle email automatiche' },
  { name: 'review',   file: 'tests/journey/review-url.mjs', what: 'link recensione Google' },
  { name: 'dossier',  file: 'tests/dossier/run.mjs',      what: 'fascicolo ARPE: autorizzazione e upload' },
  { name: 'lock',     file: 'tests/lock/run.mjs',         what: 'lucchetto immobile: due candidati non chiudono lo stesso' },
  { name: 'pastate',  file: 'tests/preagreement/state.mjs', what: 'stato proposta: un deal pagato non torna mai indietro, e la riserva si sblocca' },
  { name: 'bonifico', file: 'tests/bonifico/run.mjs',     what: 'bonifico gratuito: causale, abbinamento certo' },
  { name: 'fee',      file: 'tests/bonifico/fee.mjs',     what: 'commissione misurata sul costo reale Stripe' },
  { name: 'parity',   file: 'tests/bonifico/parity.mjs',  what: 'la causale mostrata = quella che la banca riconosce' },
  { name: 'iban',     file: 'tests/iban/run.mjs',         what: 'un IBAN sbagliato non arriva mai in /casa' },
  { name: 'photoreal',file: 'tests/photoreal/run.mjs',    what: '3D isolato: camera prima del tileset, comandi, chiusura' },
  { name: 'photos',   file: 'tests/photos/sweep.mjs',     what: 'sweep notturno: chi si cura e in che ordine' },
  { name: 'copy',     file: 'tests/copy/run.mjs',         what: 'descrizioni: riscrive i template, mai le parole di un umano' },
  { name: 'geo',      file: 'tests/geo/run.mjs',          what: 'precisione dei pin: portone, strada o quartiere — mai spacciati' },
  { name: 'dispo',    file: 'tests/dispo/run.mjs',        what: 'date di disponibilità: una data illeggibile non diventa MAI "libera ora", un messaggio aggiorna tutte le case, e una data sola non si spalma su chi non è stato nominato' },
  { name: 'scheda',   file: 'tests/scheda/run.mjs',       what: 'La Scheda: token derivati, prefill, lock post-firma, doppio schema' },
  { name: 'notify',   file: 'tests/notify/run.mjs',       what: 'ciclo email contratto: CAF una volta sola, inviti per ruolo e lingua' },
  { name: 'viewings', file: 'tests/viewings/avail.mjs',   what: 'griglia slot: passi, gap, preavviso, orizzonte, DST, link cliente' },
  { name: 'vtelegram',file: 'tests/viewings/telegram.mjs', what: 'card Telegram visite: callback ≤64B, escaping' },
  { name: 'gcal',     file: 'tests/viewings/busyics.mjs', what: 'Google Workspace nella griglia: gli impegni ICS tolgono gli slot, eventi BOOM filtrati' },
  { name: 'gap',      file: 'tests/viewings/gap.mjs',     what: 'geometria della giornata: visite stesso immobile a catena, viaggi reali tra zone' },
  { name: 'availui',  file: 'tests/viewings/availability-ui.mjs', what: 'regola disponibilità: finestre valide, default allineati al server, avviso conflitti' },
  { name: 'regista',  file: 'tests/regista/run.mjs',      what: 'Il Regista: grammatica promemoria, id deterministici, foglio di chiamata' },
  { name: 'recupero', file: 'tests/recovery/run.mjs',     what: 'Il Recupero: checkout abbandonati → lead, mai i test dell\'operatore, lingua dal cliente' },
  { name: 'hold', file: 'tests/hold/run.mjs',             what: 'L\'hold €300 che blocca davvero: presa 48h, spazzino che libera solo gli scaduti, one-shot catalogo idempotente' },
  { name: 'reverse',  file: 'tests/reverse/run.mjs',      what: 'ricerca rovesciata: chi in archivio cercava questa casa — e chi non va MAI disturbato' },
  { name: 'wizhealth',file: 'tests/wizard/health.mjs',   what: 'guardiano del bot: wrapper saltato lo dice una volta, il documento assente non tace per sempre' },
  { name: 'salute',   file: 'tests/pfs/health.mjs',      what: 'allarmi radar: una fonte bloccata parla UNA volta, un guasto vero si dirada' },
  { name: 'eyes',     file: 'tests/pfs/eyes.mjs',        what: 'occhi di Homie sul radar PFS: lista di lavoro viva, e un radar cieco non sembra un mercato fermo' },
  { name: 'whatsapp', file: 'tests/whatsapp/run.mjs',     what: 'WhatsApp → lead senza AI: rumore fuori, persona vera dentro, un lead per persona' },
  { name: 'miniera',  file: 'tests/miniera/run.mjs',      what: 'La Miniera: lo storico wacli diventa un verdetto onesto — join per telefono in ogni forma, veti prima del punteggio, sotto campione niente numeri' },
  { name: 'richiamo', file: 'tests/richiamo/run.mjs',     what: 'Il Richiamo: una campagna, un tap — i veti prima di tutto (inquilini/prenotati/cooldown MAI), un secondo tap non rimanda niente, il postino consegna davvero' },
  { name: 'sell',     file: 'tests/sell/run.mjs',         what: 'Il Link che Vende: la firma sblocca il catalogo, il link nudo resta ai due sicuri, e un servizio ambiguo non si indovina' },
  { name: 'referral', file: 'tests/referral/run.mjs',     what: 'Il referral che vale: la segnalazione diventa un lead vero con dentro chi l\'ha mandata, e un amico irraggiungibile non entra' },
  { name: 'growth',   file: 'tests/growth/run.mjs',       what: 'I due canali gratuiti: università e aziende entrano in pipeline col loro codice, e la recensione si chiede solo a chi ha già le chiavi' },
  { name: 'webforms', file: 'tests/webforms/run.mjs',     what: 'i moduli pubblici entrano in pipeline, e il datore di lavoro di un candidato non viene scambiato per un honeypot' },
  { name: 'letter',   file: 'tests/letter/run.mjs',       what: 'la diffida per il deposito: PDF vero, art. 1590 e termine di 15 giorni, e si intima il TRATTENUTO non il deposito intero' },
  { name: 'verbale',  file: 'tests/verbale/run.mjs',      what: 'verbale consegna chiavi: PDF vero in allegato alle parti, owner solo sui propri immobili, firme mai persistite come dataURI' },
  { name: 'rendiconto', file: 'tests/rendiconto/run.mjs', what: 'rendiconto proprietario: solo il mese giusto nei numeri, PDF in allegato, un rerun non rispedisce, senza email mai perso in silenzio' },
  { name: 'conservazione', file: 'tests/conservazione/run.mjs', what: 'archivio fuori piattaforma: lo ZIP contiene i byte veri, il mancante finisce nell\'INDICE, un rerun non rispedisce' },
  { name: 'backup',   file: 'tests/backup/run.mjs',       what: 'il backup del database: le collezioni core, il manifest che dice la verità sul troncamento, cron+regola Storage+heartbeat, e i due cron ciechi ora col battito' },
  { name: 'reunion',  file: 'tests/reunion/run.mjs',      what: 'BOOM La Réunion: il lead dice sempre da che parte sta (proprietario o inquilino), e la macchina romana TACE invece di rispondere in inglese su Roma a chi scrive dall\'isola' },
  { name: 'executive', file: 'tests/executive/run.mjs',   what: 'BOOM Executive: il professionista in trasferta è un TENANT (macchina piena), il datore dichiarato non è un honeypot, e la voce B2B tace col tenant e parla con l\'ente — prima della spesa' },
  { name: 'feed',     file: 'tests/feed/run.mjs',         what: 'feed Immobiliare: solo il pubblicabile, identità e date da specifica, la precisione del pin non si spaccia, gzip vero' },
  { name: 'publisher', file: 'tests/publisher/run.mjs',   what: 'Il Pubblicista: diff guidato dallo stato, remove prima di create, fallimenti parcheggiati non a vuoto, pannello bloccato ≠ catalogo allineato' },
  { name: 'sdd',      file: 'tests/sdd/run.mjs',          what: 'canone automatico SEPA: un addebito per rata per costruzione, mai il deposito, mai debiti pre-mandato, un fallimento non si ritenta da solo, doppio incasso mai sovrascritto' },
  { name: 'signlang', file: 'tests/sign/lang.mjs',        what: 'la pagina di firma parla la lingua di chi firma' },
  { name: 'market',   file: 'tests/market/engine.mjs',   what: 'il libro mastro del Perito: un blocco non e una morte, i contatti non entrano, sotto campione niente numeri' },
  { name: 'marketwiring', file: 'tests/market/wiring.mjs', what: 'le giunzioni del Perito: tap best-effort dopo il master, verdetto solo lato server, rules e cron presenti' },
  { name: 'squadra',  file: 'tests/squadra/registry.mjs', what: 'organigramma: nessun cron gira senza comparire, e chi agisce da solo lo dichiara' },
  { name: 'desk',     file: 'tests/squadra/desk.mjs',     what: 'la scrivania si disegna tutta senza Firestore, coi confini di ogni agente in chiaro' },
  { name: 'contractpdf', file: 'tests/contractpdf/run.mjs', what: 'il PDF del contratto in UNA copia: nasce anche dal rail PA (convert/send-sign/lookup), mai sotto una firma viva, jspdf pinnato nei due manifest' },
  { name: 'safari',   file: 'tests/safari/boot.mjs',      what: 'nessuna pagina autenticata resta appesa' },
  { name: 'mobile',   file: 'tests/mobile/run.mjs',       what: 'M2 Portal App: giunzioni su portal-app.js (nomi campo, sezioni, ordine, CSS gated, sw)' },
  { name: 'mobileui', file: 'tests/mobile/ui.mjs',        what: 'M2 Portal App in un browser vero: tab bar, sheet, wizard contratti (validazione LORO), rotazione, kill switch' },
  { name: 'finish',   file: 'tests/finish/run.mjs',       what: 'La Rifinitura: nessun colore inventato, nessun selettore morto, la riga contratto ridisegnata non perde handler né condizioni' },
  { name: 'actions',  file: 'tests/actions/run.mjs',      what: 'Il Prontuario: ogni azione dichiarata esiste davvero (22 documenti, sezioni, modali), la ricerca trova per sinonimo e prefisso, e le due facce leggono lo stesso registro' },
  { name: 'desktop',  file: 'tests/desktop/run.mjs',      what: 'D1 BOOM OS: giunzioni su portal-app.js (comandi veri, query 920 condivisa, motore di ricerca sollevato mai copiato)' },
  { name: 'desktopui', file: 'tests/desktop/ui.mjs',      what: 'D1 BOOM OS in un browser vero: ⌘K, chord, peek drawer, il confine dei 920px attraversato nei due sensi' },
];

const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const suites = want.length ? SUITES.filter((s) => want.includes(s.name)) : SUITES;
if (!suites.length) {
  console.error('Nessuna suite con questo nome. Disponibili: ' + SUITES.map((s) => s.name).join(', '));
  process.exit(2);
}

const run = (file) => new Promise((resolve) => {
  const p = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => resolve({ code, out }));
});

const B = '\x1b[1m', G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', X = '\x1b[0m';

// ── PRE-VOLO: nessuna suite può essere verde su UNA SOLA macchina ───────
// Il 19 agosto 2026, il giorno in cui la CI ha cominciato a lanciarle tutte
// davvero, tre suite sono cadute all'istante — non per un difetto del
// prodotto, ma perché passavano a playwright un `executablePath` cablato
// alla Chromium di questa macchina. Non trovandolo, playwright non ripiega
// sul browser che ha installato: muore. Erano verdi su un solo schermo al
// mondo, e nessuno poteva accorgersene perché nessuno le eseguiva altrove.
// Ora il percorso vive in tests/_browser.mjs, dove vale come SUGGERIMENTO
// (si usa se il file esiste). Questo controllo impedisce che ricompaia.
{
  const offenders = [];
  for (const s of SUITES) {
    let src = '';
    try { src = readFileSync(new URL('../' + s.file, import.meta.url), 'utf8'); } catch { continue; }
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    if (/executablePath[^\n]*\/opt\//.test(code)) offenders.push(s.file);
  }
  if (offenders.length) {
    console.log(`${R}${B}Percorso browser cablato (verde su una macchina sola):${X} ${offenders.join(', ')}`);
    console.log('  Usa launchOptions() da tests/_browser.mjs.');
    process.exit(1);
  }
}

let failed = [];
const t0 = Date.now();

for (const s of suites) {
  process.stdout.write(`${B}▸ ${s.name}${X}  ${s.what}\n`);
  const { code, out } = await run(s.file);
  const skipped = /^SKIP:/m.test(out);
  // ultima riga di risultato della suite, qualunque formato usi
  const line = out.split('\n').reverse().find((l) => /passed|failed|SKIP/i.test(l)) || '';
  if (skipped) console.log(`  ${Y}⊘ saltata${X} — ${line.replace(/^SKIP:\s*/, '')}`);
  else if (code === 0) console.log(`  ${G}✓${X} ${line.replace(/\x1b\[[0-9;]*m/g, '').trim()}`);
  else {
    failed.push(s.name);
    console.log(out.split('\n').filter((l) => /✗|FAIL/.test(l)).map((l) => '  ' + l).join('\n') || out.slice(-600));
    console.log(`  ${R}✗ ${s.name} fallita${X}`);
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('\n────────────────────────────────────────────────');
if (failed.length) {
  console.log(`${R}${B}${failed.length} suite fallite: ${failed.join(', ')}${X}  (${secs}s)`);
  process.exit(1);
}
console.log(`${G}${B}Tutte le suite passano${X}  (${suites.length} suite, ${secs}s)`);
