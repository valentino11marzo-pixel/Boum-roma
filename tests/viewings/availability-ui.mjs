// tests/viewings/availability-ui.mjs — la regola della disponibilità.
//
// Una finestra oraria scritta male non dà un errore visibile: dà una griglia
// vuota, e l'operatore lo scopre dal cliente che non riesce a prenotare. Per
// questo il parsing e la validazione sono puri e testati qui, e per questo
// buildConfig LANCIA invece di "aggiustare" un valore impossibile.
//
// Run: node tests/viewings/availability-ui.mjs

// js/ è CommonJS (come boom-geo/canone-engine): stesso import dei loro test,
// così il file caricato dal browser è ESATTAMENTE quello sotto test.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  parseWindows, formatWindows, buildConfig, previewCount, checkSlot,
  toMin, toHHMM, UI_DEFAULTS, DAYS,
} = require('../../js/viewing-availability.js');
import { DEFAULTS as SERVER_DEFAULTS, buildSlots } from '../../api/viewings/_avail.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

// ── 1. la console mostra ciò che il server fa davvero ─────────────────────
{
  // se questi due divergono, l'operatore modifica una regola che non è quella
  // in vigore — il bug più insidioso possibile in questa pagina
  ok('i default della console = quelli del server',
    JSON.stringify(UI_DEFAULTS.windows) === JSON.stringify(SERVER_DEFAULTS.windows),
    JSON.stringify(UI_DEFAULTS.windows));
  ok('anche durate, preavviso, orizzonte e max/giorno',
    UI_DEFAULTS.minNoticeHours === SERVER_DEFAULTS.minNoticeHours
    && UI_DEFAULTS.horizonDays === SERVER_DEFAULTS.horizonDays
    && UI_DEFAULTS.maxPerDay === SERVER_DEFAULTS.maxPerDay
    && UI_DEFAULTS.slotMinutes.person === SERVER_DEFAULTS.slotMinutes.person
    && UI_DEFAULTS.slotMinutes.video === SERVER_DEFAULTS.slotMinutes.video);
  ok('i 7 giorni ci sono tutti, lunedì per primo', DAYS.length === 7 && DAYS[0].i === 1 && DAYS[6].i === 0);
}

// ── 2. parsing delle finestre ─────────────────────────────────────────────
{
  ok('una finestra semplice', JSON.stringify(parseWindows('10:00-13:00')) === '[["10:00","13:00"]]');
  ok('due finestre con spazi e trattino lungo',
    JSON.stringify(parseWindows(' 10:00 – 13:00 ,  15:00-19:00 ')) === '[["10:00","13:00"],["15:00","19:00"]]');
  ok('ore a una cifra normalizzate', JSON.stringify(parseWindows('9:30-12:00')) === '[["09:30","12:00"]]');
  ok('vuoto = giorno chiuso', parseWindows('').length === 0 && parseWindows('  ').length === 0);
  ok('riordina da sola', JSON.stringify(parseWindows('15:00-19:00, 10:00-13:00')) === '[["10:00","13:00"],["15:00","19:00"]]');
  ok('round-trip format→parse', formatWindows(parseWindows('10:00-13:00, 15:00-19:00')) === '10:00-13:00, 15:00-19:00');

  ok('fine prima dell\'inizio è un errore', throws(() => parseWindows('19:00-15:00'), /dopo l'inizio/));
  ok('finestre sovrapposte sono un errore', throws(() => parseWindows('10:00-14:00, 13:00-16:00'), /sovrapposte/));
  ok('25:00 non esiste', throws(() => parseWindows('25:00-26:00'), /non valido/));
  ok('testo libero non passa', throws(() => parseWindows('mattina'), /non valido/));
  ok('minuti oltre 59 non passano', throws(() => parseWindows('10:70-12:00'), /non valido/));
}

// ── 3. buildConfig: rifiuta, non aggiusta ─────────────────────────────────
{
  const form = {
    windows: { 1: '10:00-13:00', 2: '', 3: '', 4: '', 5: '', 6: '', 0: '' },
    person: 45, video: 20, minNoticeHours: 4, horizonDays: 14, maxPerDay: 6,
  };
  const cfg = buildConfig(form);
  ok('costruisce il doc che il server legge',
    JSON.stringify(cfg.windows) === '{"1":[["10:00","13:00"]]}' && cfg.slotMinutes.person === 45, JSON.stringify(cfg));
  ok('i giorni vuoti non finiscono nel doc', !('2' in cfg.windows));

  ok('zero giorni aperti è un errore parlante',
    throws(() => buildConfig({ ...form, windows: { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 0: '' } }), /Almeno un giorno/));
  ok('durata assurda rifiutata', throws(() => buildConfig({ ...form, person: 5 }), /tra 10 e 180/));
  ok('orizzonte fuori scala rifiutato', throws(() => buildConfig({ ...form, horizonDays: 90 }), /tra 1 e 30/));
  ok('max/giorno zero rifiutato', throws(() => buildConfig({ ...form, maxPerDay: 0 }), /tra 1 e 20/));
  ok('preavviso negativo rifiutato', throws(() => buildConfig({ ...form, minNoticeHours: -1 }), /tra 0 e 168/));
  ok('preavviso 0 è legittimo (prenotazione last-minute)', buildConfig({ ...form, minNoticeHours: 0 }).minNoticeHours === 0);

  // il campo calendario: è una credenziale, non un URL qualsiasi
  ok('un ICS http (non sicuro) è rifiutato', throws(() => buildConfig({ ...form, busyIcs: 'http://cal/x.ics' }), /https/));
  ok('un ICS https passa', buildConfig({ ...form, busyIcs: 'https://cal/x.ics' }).busyIcs === 'https://cal/x.ics');
  ok('svuotarlo scollega il calendario', buildConfig({ ...form, busyIcs: '  ' }).busyIcs === null);

  // il double confirm: il default è "confermo io", e deve poter essere spento
  ok('di default confermo io ogni visita', buildConfig(form).requireApproval === true);
  ok('…e la console concorda col server', UI_DEFAULTS.requireApproval === SERVER_DEFAULTS.requireApproval);
  ok('si può passare all\'istantaneo', buildConfig({ ...form, requireApproval: false }).requireApproval === false);
  ok('il valore è sempre booleano', buildConfig({ ...form, requireApproval: 'si' }).requireApproval === true);
}

// ── 4. l'anteprima deve dire il vero ──────────────────────────────────────
{
  // 10:00-13:00 con visite da 45' e gap 15' → 10:00, 11:00, 12:00 = 3
  ok('conta gli slot come li conta il server', previewCount({ 1: [['10:00', '13:00']] }, 45, 15) === 3,
    String(previewCount({ 1: [['10:00', '13:00']] }, 45, 15)));

  // controprova contro il VERO motore: stesso numero di slot in un lunedì
  const cfg = { windows: { 1: [['10:00', '13:00']] }, slotMinutes: { person: 45, video: 20 }, minNoticeHours: 0, horizonDays: 7, maxPerDay: 20 };
  const mon = buildSlots(cfg, [], 'person', new Date('2026-08-03T06:00:00Z')).find(d => d.date === '2026-08-03');
  ok('l\'anteprima non promette più slot di quelli reali',
    previewCount(cfg.windows, 45, 15) <= mon.times.length + 1, `${previewCount(cfg.windows, 45, 15)} vs ${mon.times.length}`);
  ok('video ne fa entrare di più', previewCount({ 1: [['10:00', '13:00']] }, 20, 15) > previewCount({ 1: [['10:00', '13:00']] }, 45, 15));
  ok('nessuna finestra = nessuno slot', previewCount({}, 45) === 0);
}

// ── 5. l'avviso: avverte, non blocca ──────────────────────────────────────
{
  const CFG = { windows: { 1: [['10:00', '13:00'], ['15:00', '19:00']] } };
  const NOW = new Date('2026-07-31T09:00:00Z');
  const others = [{
    id: 'v1', start: new Date('2026-08-03T08:00:00Z'), minutes: 45,   // lun 10:00 Roma
    clientName: 'Marco Rossi', listingName: 'Trastevere',
  }];

  const clean = checkSlot(new Date('2026-08-03T09:30:00Z'), 45, others, CFG, null, NOW);  // 11:30 Roma
  ok('un orario buono non genera avvisi', clean.length === 0, JSON.stringify(clean));

  const clash = checkSlot(new Date('2026-08-03T08:15:00Z'), 45, others, CFG, null, NOW);  // 10:15, dentro v1
  ok('la sovrapposizione è segnalata', clash.some(w => w.level === 'clash'), JSON.stringify(clash));
  ok('…col nome del cliente e l\'ora', clash.some(w => /Marco Rossi/.test(w.text) && /10:00/.test(w.text)), JSON.stringify(clash));

  ok('spostando la visita stessa non c\'è conflitto con sé',
    checkSlot(new Date('2026-08-03T08:00:00Z'), 45, others, CFG, 'v1', NOW).filter(w => w.level === 'clash').length === 0);

  const outside = checkSlot(new Date('2026-08-03T12:00:00Z'), 45, [], CFG, null, NOW);    // 14:00 Roma, pausa
  ok('fuori finestra è segnalato', outside.some(w => w.level === 'outside'), JSON.stringify(outside));

  const sunday = checkSlot(new Date('2026-08-02T09:00:00Z'), 45, [], CFG, null, NOW);
  ok('un giorno chiuso lo dice chiaramente', sunday.some(w => w.level === 'outside' && /non hai finestre/.test(w.text)));

  ok('il passato è segnalato',
    checkSlot(new Date('2026-07-30T09:00:00Z'), 45, [], CFG, null, NOW).some(w => w.level === 'past'));

  // una visita che sfora la fine della finestra non è "dentro"
  ok('una visita che sfora la finestra è fuori',
    checkSlot(new Date('2026-08-03T10:30:00Z'), 45, [], CFG, null, NOW).some(w => w.level === 'outside'));

  ok('una data non valida non esplode', checkSlot(new Date('boh'), 45, others, CFG, null, NOW).length === 0);
  ok('senza altre visite non inventa conflitti',
    checkSlot(new Date('2026-08-03T08:00:00Z'), 45, null, CFG, null, NOW).filter(w => w.level === 'clash').length === 0);
}

// ── 5b. il double confirm, lato server: cosa NON deve partire ─────────────
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../api/viewings/slots.js', import.meta.url), 'utf8');
  const post = src.slice(src.indexOf('const needsApproval'));
  const iApproval = post.indexOf('if (needsApproval)');
  const iConfirm = post.indexOf('sendConfirmation(');
  const iInvite = post.indexOf('inviteOperator(');

  ok('la richiesta nasce pending', /status: needsApproval \? 'pending' : 'confirmed'/.test(post));
  ok('il ramo approvazione esiste ed esce prima', iApproval > 0 && iApproval < iConfirm);
  // il punto: un pass e un invito in calendario per una visita NON confermata
  // sono una bugia al cliente e un evento fantasma nell'agenda dell'operatore
  ok('nessuna email di conferma su una richiesta', iApproval < iConfirm, `${iApproval} vs ${iConfirm}`);
  ok('nessun invito in calendario su una richiesta', iApproval < iInvite, `${iApproval} vs ${iInvite}`);
  ok('la richiesta manda la SUA email', /sendRequested\(/.test(post));
  ok('i campi confirmed* non si scrivono su una richiesta', /\.\.\.\(needsApproval \? \{\} : \{/.test(post));
  ok('la risposta dichiara lo stato al client', /status: 'pending'/.test(post));

  const grid = src.slice(0, src.indexOf('const needsApproval'));
  ok('la griglia dice alla pagina se serve approvazione', /requireApproval: !!cfg\.requireApproval/.test(grid));
}

// ── 6. helper ─────────────────────────────────────────────────────────────
{
  ok('toMin/toHHMM sono inversi', toHHMM(toMin('09:05')) === '09:05' && toMin('00:00') === 0);
  ok('toMin rifiuta il non-orario', toMin('abc') === null && toMin('') === null);
}

console.log(fails ? `\n${fails} FAILED` : '\nAll green.');
process.exit(fails ? 1 : 0);
