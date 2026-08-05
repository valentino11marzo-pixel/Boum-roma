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

console.log(`\n  ${pass} passati, ${fail} falliti\n`);
process.exit(fail ? 1 : 0);
