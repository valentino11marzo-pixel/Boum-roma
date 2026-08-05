// tests/squadra/registry.mjs — L'ORGANIGRAMMA NON PUÒ MENTIRE.
//
// La lista dei dipendenti dentro team.html si era fermata a 8 voci mentre i
// cron erano 23: mancavano — fra gli altri — il Selezionatore che archivia
// lead da solo, il Fotografo che di notte riscrive le foto degli annunci e il
// Rendiconto che il 1° del mese manda un PDF a ogni proprietario. Nessuno se
// n'era accorto perché NIENTE confrontava quella lista con la realtà.
//
// Qui la realtà sono i cron di vercel.json. Due errori, entrambi fatali:
//   • un cron che nessun agente dichiara = un dipendente fantasma, che lavora
//     sui dati veri e non compare nell'organigramma
//   • un agente che dichiara un cron inesistente = una persona in organico
//     che non lavora più
//
// Più le regole che tengono onesta la lettera di assunzione: chi non passa da
// approvazione DEVE dichiarare cosa fa da solo, e chi parla ai clienti senza
// approvazione dev'essere dichiarato tale — è la riga che il titolare legge
// per prima.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const require = createRequire(import.meta.url);
const S = require(join(root, 'js', 'squadra-registry.js'));

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

console.log('\nORGANIGRAMMA — il registro contro la realtà\n');

const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const cronPaths = (vercel.crons || []).map(c => c.path);

check('nessun dipendente fantasma: ogni cron è dichiarato da un agente', () => {
  const { unclaimed } = S.driftVsCrons(cronPaths);
  assert.deepEqual(unclaimed, [],
    `cron che girano sui dati veri senza comparire nell'organigramma:\n      ${unclaimed.join('\n      ')}`);
});

check('nessuno in organico che non lavora: ogni cron dichiarato esiste', () => {
  const { missing } = S.driftVsCrons(cronPaths);
  assert.deepEqual(missing, [],
    `agenti che puntano a cron inesistenti:\n      ${missing.join('\n      ')}`);
});

check('ogni agente ha una lettera di assunzione completa', () => {
  for (const a of S.TEAM) {
    assert.ok(a.key && a.name && a.emoji, `voce senza identità: ${JSON.stringify(a.key)}`);
    assert.ok(a.hired && a.hired.length > 20, `${a.name}: manca il PERCHÉ è stato assunto`);
    assert.ok(Array.isArray(a.mandate) && a.mandate.length >= 2, `${a.name}: mansione troppo scarna`);
    assert.ok(a.autonomy && a.autonomy.solo && a.autonomy.porta && a.autonomy.mai,
      `${a.name}: le tre liste di autonomia sono obbligatorie`);
    assert.ok(a.autonomy.mai.length >= 1, `${a.name}: un dipendente senza confini non è un dipendente`);
    assert.ok(S.REPARTI.includes(a.reparto), `${a.name}: reparto sconosciuto "${a.reparto}"`);
  }
});

check('le chiavi consegnate esistono nel vocabolario', () => {
  for (const a of S.TEAM) {
    assert.ok(Array.isArray(a.reach) && a.reach.length, `${a.name}: nessun reach dichiarato`);
    for (const r of a.reach) assert.ok(S.REACH[r], `${a.name}: reach sconosciuto "${r}"`);
  }
});

check('approval dichiarato con un valore reale', () => {
  for (const a of S.TEAM) {
    assert.ok(['mai', 'sempre', 'parziale'].includes(a.approval),
      `${a.name}: approval "${a.approval}" non è un valore valido`);
  }
});

check('chi agisce senza approvazione dichiara cosa fa da solo', () => {
  for (const a of S.TEAM) {
    if (a.approval === 'mai') {
      assert.ok(a.autonomy.solo.length >= 1,
        `${a.name} agisce senza chiedere ma non dichiara nulla in "solo" — è esattamente il buco che questo file chiude`);
    }
  }
});

check('chi passa SEMPRE da approvazione non può agire da solo sui clienti', () => {
  for (const a of S.TEAM) {
    if (a.approval === 'sempre') {
      assert.ok(!a.reach.includes('clienti'),
        `${a.name} è dichiarato "sempre approvato" ma ha la chiave per parlare ai clienti: una delle due è falsa`);
    }
  }
});

// La verità del codice, pinnata: sono i DUE che passano da action_queue.
check('esattamente Gestore e Commerciale passano da approvazione umana', () => {
  const approved = S.TEAM.filter(a => a.approval === 'sempre').map(a => a.key).sort();
  assert.deepEqual(approved, ['commerciale', 'gestore'],
    'se cambia chi propone invece di agire, questo test deve cambiare CON il codice');
});

check('chi parla ai clienti senza rete è elencabile a colpo d\'occhio', () => {
  const speakers = S.speaksToClients().map(a => a.key).sort();
  assert.ok(speakers.length >= 3, 'la lista dovrebbe contenere Metronomo, Segugio, Rendiconto, Contabile');
  for (const k of ['metronomo', 'segugio', 'rendiconto', 'contabile']) {
    assert.ok(speakers.includes(k), `${k} manda email ai clienti senza approvazione: deve comparire`);
  }
});

check('l\'attenzione premia chi agisce solo sui clienti, non chi propone', () => {
  assert.equal(S.attentionOf(S.get('commerciale')), 0, 'chi passa sempre da te non richiede vigilanza');
  assert.ok(S.attentionOf(S.get('fotografo')) >= 2, 'riscrive la vetrina di notte, da solo');
  assert.ok(S.attentionOf(S.get('metronomo')) >= 2, 'manda email ai clienti, da solo');
  assert.ok(S.attentionOf(S.get('centralino')) === 0, 'porta e basta: non agisce');
});

check('lo stato di salute legge il battito come faceva team.html', () => {
  const now = Date.parse('2026-08-05T12:00:00Z');
  assert.equal(S.statusOf(null, now), 'off', 'mai girato');
  assert.equal(S.statusOf({ lastRunAt: new Date(now - 60e3), ok: true }, now), 'ok');
  assert.equal(S.statusOf({ lastRunAt: new Date(now - 31 * 3600e3), ok: true }, now), 'warn', 'vivo ma vecchio');
  assert.equal(S.statusOf({ lastRunAt: new Date(now), ok: false, consecutiveErrors: 1 }, now), 'warn');
  assert.equal(S.statusOf({ lastRunAt: new Date(now), ok: false, consecutiveErrors: 3 }, now), 'err');
});

check('i reparti coprono tutti — nessuno finisce fuori dall\'organigramma', () => {
  const grouped = S.byReparto().reduce((n, r) => n + r.agents.length, 0);
  assert.equal(grouped, S.TEAM.length, 'un agente con reparto ignoto sparirebbe dalla pagina');
});

// ── LE MANOPOLE ───────────────────────────────────────────────────────────
// Regola dichiarata nel registro: qui stanno SOLO manopole realmente
// collegate. Una manopola che non fa niente è peggio di nessuna manopola — la
// giri, non succede nulla, e da lì in poi non ti fidi più della pagina. Il
// test la rende meccanica invece che una buona intenzione.

const AGENT_SRC = {
  gestore: 'api/employees/gestore.js',
  commerciale: 'api/employees/commerciale.js',
  'lead-brain': 'api/leads/brain.js'
};

check('ogni manopola dichiarata è DAVVERO letta dal codice dell\'agente', () => {
  for (const [key, rel] of Object.entries(AGENT_SRC)) {
    const src = readFileSync(join(root, rel), 'utf8');
    for (const d of S.knobsFor(key)) {
      assert.ok(src.includes('k.' + d.key),
        `${key}: la manopola "${d.key}" è nella pagina ma ${rel} non la legge — sarebbe un comando finto`);
    }
  }
});

check('nessun agente espone manopole senza essere collegato', () => {
  for (const key of Object.keys(S.KNOBS)) {
    assert.ok(AGENT_SRC[key], `${key} dichiara manopole ma non è nella lista dei collegati`);
    assert.ok(S.get(key), `${key} non è nemmeno nell'organigramma`);
  }
});

// LA GARANZIA DI NON-REGRESSIONE. Prima le soglie erano costanti nel sorgente.
// Se un default qui divergesse, la squadra cambierebbe comportamento in
// silenzio il giorno del deploy, su clienti veri. I valori sono pinnati a
// quelli che le costanti avevano.
check('senza impostazioni salvate il comportamento è identico a prima', () => {
  const g = S.resolveKnobs('gestore', undefined).values;
  assert.equal(g.lateAfterDays, 3, 'era LATE_AFTER_DAYS = 3');
  assert.equal(g.unsignedAfterDays, 3, 'era UNSIGNED_AFTER_DAYS = 3');
  assert.equal(g.renewalHorizonDays, 90, 'era RENEWAL_HORIZON = 90');

  const c = S.resolveKnobs('commerciale', undefined).values;
  assert.equal(c.humanWindowMin, 20, 'era HUMAN_WINDOW_MS = 20 min');
  assert.equal(c.followupAfterHours, 48, 'era FOLLOWUP_AFTER_MS = 48h');
  assert.equal(c.maxLeadAgeDays, 14, 'era MAX_LEAD_AGE_MS = 14gg');
  assert.equal(c.maxFirstPerRun, 5, 'era MAX_FIRST_PER_RUN = 5');
  assert.equal(c.maxFollowupPerRun, 3, 'era MAX_FOLLOWUP_PER_RUN = 3');

  const b = S.resolveKnobs('lead-brain', undefined).values;
  assert.equal(b.batchMax, 20, 'era BATCH_MAX = 20');
  assert.equal(b.dailyAiCallCap, 12, 'era DAILY_AI_CALL_CAP = 12');
});

check('alla porta un valore impossibile viene RIFIUTATO, non aggiustato', () => {
  const tooBig = S.validateKnobs('gestore', { lateAfterDays: 999 });
  assert.equal(tooBig.ok, false, 'un valore fuori scala deve fallire');
  assert.match(tooBig.errors[0], /da 0 a 30/);

  const frac = S.validateKnobs('commerciale', { maxFirstPerRun: 2.5 });
  assert.equal(frac.ok, false, '2.5 bozze non esistono');

  const nan = S.validateKnobs('commerciale', { humanWindowMin: 'venti' });
  assert.equal(nan.ok, false);
  assert.match(nan.errors[0], /non è un numero/);

  const good = S.validateKnobs('gestore', { lateAfterDays: 5 });
  assert.equal(good.ok, true);
  assert.equal(good.values.lateAfterDays, 5);
  assert.equal(good.values.renewalHorizonDays, 90, 'i campi non toccati restano al default');
});

check('a runtime un valore corrotto non ferma mai un cron', () => {
  const r = S.resolveKnobs('gestore', { lateAfterDays: 'tre', renewalHorizonDays: 5000 });
  assert.equal(r.values.lateAfterDays, 3, 'torna al default invece di esplodere');
  assert.equal(r.values.renewalHorizonDays, 90);
  assert.equal(r.rejected.length, 2, 'e non lo ingoia: il report lo dice');
  assert.ok(r.rejected.every(x => x.why), 'ogni rifiuto spiega perché');
});

check('un valore valido salvato viene davvero applicato', () => {
  const r = S.resolveKnobs('commerciale', { maxFirstPerRun: 0, humanWindowMin: 90 });
  assert.equal(r.values.maxFirstPerRun, 0, 'a 0 il Commerciale smette di preparare prime risposte');
  assert.equal(r.values.humanWindowMin, 90);
  assert.deepEqual(r.rejected, []);
});

check('knobDiff elenca solo ciò che è stato davvero cambiato', () => {
  assert.deepEqual(S.knobDiff('gestore', undefined), [], 'di fabbrica: nessuna differenza');
  const d = S.knobDiff('gestore', { lateAfterDays: 7 });
  assert.equal(d.length, 1);
  assert.equal(d[0].from, 3);
  assert.equal(d[0].to, 7);
});

check('gli intervalli sono sensati e contengono il default', () => {
  for (const [key, defs] of Object.entries(S.KNOBS)) {
    for (const d of defs) {
      assert.ok(d.min < d.max, `${key}.${d.key}: intervallo vuoto`);
      assert.ok(d.def >= d.min && d.def <= d.max, `${key}.${d.key}: il default è fuori dal proprio intervallo`);
      assert.ok(d.label && d.unit && d.help, `${key}.${d.key}: manca l'etichetta, l'unità o la spiegazione`);
    }
  }
});

console.log(`\n  ${pass} passati, ${fail} falliti\n`);
process.exit(fail ? 1 : 0);
