// tests/wizard/health.mjs — quando il guardiano del bot deve parlare.
//
// IL CASO REALE, 7 agosto 2026. Per 12 giorni launchd ha lanciato
// boom_listing_wizard.py DIRETTAMENTE invece di wizard_heartbeat.py:
// l'auto-aggiornamento non è mai partito, il codice sul Mac è rimasto fermo a
// due settimane prima, e questo guardiano ha taciuto tutto il tempo — perché
// "documento heartbeat assente" era codificato come stato neutro ("wrapper non
// ancora deployato"). Il guasto peggiore e una macchina appena installata
// producevano lo stesso identico silenzio verde.
//
// Qui si pinna il comportamento nuovo, e la disciplina è quella di
// api/pfs/_health.js (dove stanotte abbiamo corretto il difetto OPPOSTO: una
// fonte bloccata che gridava 96 volte). Regola unica: si parla quando c'è una
// DECISIONE da prendere, una volta sola per condizione.
//
// Esegui: node tests/wizard/health.mjs

import { wizardVerdict, MISSING_GRACE_MS } from '../../api/wizard/health.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

const T0 = Date.parse('2026-08-07T12:00:00Z');
const iso = ms => new Date(ms).toISOString();
const H = 3600 * 1000;

// ── 1. bot sano, lanciato come si deve → silenzio ──────────────────────────
{
  const hb = { lastSeenAt: iso(T0 - 30 * 1000), launcher: 'wizard_heartbeat.py', build: 'abc123' };
  const v = wizardVerdict(hb, T0);
  ok('bot vivo e wrapper attivo → non dice niente', v.say === null && v.state === 'live', v);
  ok('…e non è marcato come scavalcato', v.bypassed === false);
}

// ── 2. IL GUASTO DI STASERA: wrapper saltato ───────────────────────────────
// Il bot funziona, quindi nessun allarme "offline" scatterebbe mai. Ma
// l'auto-aggiornamento è spento e il codice invecchia in silenzio.
{
  const hb = { lastSeenAt: iso(T0 - 30 * 1000), launcher: 'boom_listing_wizard.py' };
  const v = wizardVerdict(hb, T0);
  ok('launchd salta il wrapper → si dice', v.say === 'bypass', v);
  ok('…ma il bot risulta comunque vivo', v.state === 'live');

  // …e una volta sola: ripeterlo ogni 6h sarebbe il radar che gridava 96 volte.
  // NB: il battito va tenuto FRESCO rispetto al nuovo "adesso", altrimenti si
  // starebbe testando un bot offline da un mese — che è un'altra notizia.
  const LATER = T0 + 30 * 24 * H;
  const after = wizardVerdict(
    { lastSeenAt: iso(LATER - 30 * 1000), launcher: 'boom_listing_wizard.py', watch: { bypassNotified: true } },
    LATER);
  ok('…e poi tace, anche dopo un mese', after.say === null, after);
  ok('…pur restando marcato come scavalcato', after.bypassed === true);

  // sistemato il plist, lo stato si azzera da solo
  const fixed = wizardVerdict({ ...hb, launcher: 'wizard_heartbeat.py', watch: { bypassNotified: true } }, T0);
  ok('rimesso a posto → nessun messaggio, e la memoria si pulisce',
    fixed.say === null && fixed.bypassed === false, fixed);
}

// ── 3. il battito assente: silenzio MISURATO, non eterno ───────────────────
{
  // primo giro: non sappiamo da quanto manca → si annota e si tace
  const first = wizardVerdict(null, T0);
  ok('doc assente, prima volta → tace e annota', first.say === null && first.first === true, first);

  // dentro la grazia: ancora silenzio (installazione nuova, Mac non aggiornato)
  const young = wizardVerdict({ watch: { missingSince: iso(T0 - 6 * H) } }, T0);
  ok('assente da 6h → ancora silenzio (grazia)', young.say === null, young);

  // oltre la grazia: UNA volta. È il silenzio senza scadenza che ha coperto
  // 12 giorni di guasto.
  const old = wizardVerdict({ watch: { missingSince: iso(T0 - 30 * H) } }, T0);
  ok('assente oltre 24h → parla', old.say === 'missing', old);
  const again = wizardVerdict({ watch: { missingSince: iso(T0 - 30 * H), missingNotified: true } }, T0 + 60 * 24 * H);
  ok('…una volta sola, anche dopo due mesi', again.say === null, again);
  ok('la grazia è 24h', MISSING_GRACE_MS === 24 * H);
}

// ── 4. offline vero, e il rientro ──────────────────────────────────────────
{
  const stale = { lastSeenAt: iso(T0 - 20 * 60 * 1000), launcher: 'wizard_heartbeat.py' };
  ok('battito vecchio di 20 min → offline', wizardVerdict(stale, T0).say === 'down');
  ok('…ma 2 minuti non bastano', wizardVerdict({ ...stale, lastSeenAt: iso(T0 - 2 * 60 * 1000) }, T0).say === null);

  // il promemoria non si ripete a ogni giro (cron ogni 10 min)
  const justAlerted = { ...stale, watch: { down: true, lastAlertAt: iso(T0 - 10 * 60 * 1000) } };
  ok('appena avvisato → non ripete', wizardVerdict(justAlerted, T0).say === null, wizardVerdict(justAlerted, T0));
  const dueAgain = { ...stale, watch: { down: true, lastAlertAt: iso(T0 - 7 * H) } };
  ok('dopo 6h → ricorda', wizardVerdict(dueAgain, T0).say === 'down');

  // il ritorno si sente SEMPRE
  const back = { lastSeenAt: iso(T0 - 10 * 1000), launcher: 'wizard_heartbeat.py', watch: { down: true } };
  ok('torna online → lo dice', wizardVerdict(back, T0).say === 'recovery');
  const neverDown = { lastSeenAt: iso(T0 - 10 * 1000), launcher: 'wizard_heartbeat.py', watch: {} };
  ok('…ma non se non era mai caduto', wizardVerdict(neverDown, T0).say === null);
}

// ── 5. la precedenza fra le condizioni ─────────────────────────────────────
// Un bot OFFLINE lanciato male: prima si dice che è offline (è più urgente),
// il wrapper si sistema quando torna su.
{
  const both = { lastSeenAt: iso(T0 - 30 * 60 * 1000), launcher: 'boom_listing_wizard.py' };
  const v = wizardVerdict(both, T0);
  ok('offline batte "wrapper saltato"', v.say === 'down', v);
  ok('…ma lo scavalcamento resta registrato', v.bypassed === true);
}

// ── 6. dati sporchi non fanno esplodere il guardiano ───────────────────────
{
  ok('lastSeenAt illeggibile → trattato come vecchissimo',
    wizardVerdict({ lastSeenAt: 'non-una-data' }, T0).state === 'down');
  ok('launcher assente → non si accusa nessuno',
    wizardVerdict({ lastSeenAt: iso(T0), launcher: null }, T0).bypassed === false);
  ok('doc vuoto → assente, non esplode', wizardVerdict({}, T0).state === 'missing');
  ok('undefined → assente', wizardVerdict(undefined, T0).state === 'missing');
}

console.log(fails ? `\n${fails} FALLITI` : '\nTutto verde.');
process.exit(fails ? 1 : 0);
