// tests/tempo/run.mjs — IL TEMPO CHE RESTA (e le chiamate che non finiscono).
//
// Dai log di produzione del 31/08/2026, non da un ragionamento: i cron
// venivano uccisi dalla piattaforma a 60s — 3 volte nelle ultime 24 ore —
// benché avessero tutti una scadenza morbida a 48s. Due cause, entrambe
// strutturali:
//
//  1. La scadenza chiedeva «sono in ritardo?» invece di «ce la faccio a
//     pagare il prossimo passo?». Passava a 47,9s e poi partiva un giro da 45.
//  2. VENTUNO file chiamavano api.anthropic.com senza alcun tetto di tempo.
//     Una richiesta appesa non falliva: teneva la funzione occupata fino al
//     kill della piattaforma — errore di piattaforma, nessun battito scritto,
//     nessuna spiegazione. Un cron che muore in silenzio è cieco per
//     definizione: è esattamente il difetto che `_health.js` esiste per
//     evitare, aggirato dal basso.
//
// La seconda regola è quella che conta di più, perché è una CLASSE: qui si
// pretende che nessun file possa più chiamare un modello senza tetto.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBudget, aiSignal } from '../../api/_budget.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. Il budget risponde alla domanda giusta ───────────────────────────
{
  const B = runBudget(60_000, 7_000);   // 53s spendibili
  ok(B.afford(45_000), 'a inizio run un giro da 45s ci sta');
  ok(!B.afford(60_000), 'ma uno da 60 no: non si comincia ciò che non si può finire');
  ok(B.left() > 52_000 && B.left() <= 53_000, 'il residuo toglie la riserva (battito, memoria, recap)');
  ok(B.capFor(45_000) <= B.left(), 'capFor non promette mai più tempo di quanto ne resti');
}
{
  // IL CASO VERO: il controllo passa, ma il passo sfora. Con una scadenza
  // «sono in ritardo?» questo giro partiva e la funzione moriva a 60s.
  const T = 60_000, SPESO = 47_900, COSTO = 45_000;
  const vecchio = SPESO < 48_000;                       // com'era
  const B = runBudget(T - SPESO, 7_000);                // com'è: budget residuo
  ok(vecchio === true, 'la vecchia regola diceva: parti pure (47,9s < 48s)');
  ok(B.afford(COSTO) === false,
    'la nuova dice NO — e quel «no» è esattamente il kill a 60s che non succede più');
}
{
  const B = runBudget(0, 0);
  ok(!B.afford(1) && B.left() === 0, 'a budget finito non si comincia niente');
  ok(B.afford(0) || true, 'costo zero non è una trappola');
}
ok(typeof aiSignal(1000) === 'object' || aiSignal(1000) === undefined,
  'aiSignal dà un segnale dove esiste, e undefined dove no (mai un errore che spegne TUTTE le chiamate)');

// ── 2. LA CLASSE: nessuna chiamata al modello senza tetto ───────────────
// Si scandaglia api/ per intero: una lista scritta a mano invecchierebbe al
// primo file nuovo — ed è proprio il file nuovo quello che sbaglia.
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.js')) out.push(p);
  }
  return out;
}
const files = walk(join(ROOT, 'api'));
const chiamanti = files.filter((p) => /api\.anthropic\.com\/v1\/messages/.test(readFileSync(p, 'utf8')));
ok(chiamanti.length >= 18, `il controllo VEDE i chiamanti (${chiamanti.length}) — una regola che non trova nulla passa sempre`);

const senzaTetto = [];
for (const p of chiamanti) {
  const s = readFileSync(p, 'utf8');
  // il tetto vale se la chiamata porta un signal (aiSignal condiviso o
  // AbortSignal diretto, come faceva già outreach/draft)
  if (!/signal:\s*(aiSignal\(|AbortSignal\.timeout\()/.test(s)) senzaTetto.push(relative(ROOT, p));
}
ok(senzaTetto.length === 0,
  'nessun file chiama il modello senza un tetto di tempo' + (senzaTetto.length ? ' — scoperti: ' + senzaTetto.join(', ') : ''));

// ── 3. I quattro scanner che morivano contano il costo, non l'orario ────
for (const f of ['api/leads/scan-inbox.js', 'api/pfs/scan-inbox.js',
                 'api/segretaria/scan-replies.js', 'api/employees/commerciale.js']) {
  const s = src(f);
  ok(/runBudget\(60_000/.test(s), `${f}: il budget parte dal limite VERO della funzione (60s in vercel.json)`);
  ok(/B\.afford\(/.test(s), `${f}: si chiede «ce la faccio?», non «sono in ritardo?»`);
  ok(!/softDeadline/.test(s), `${f}: la vecchia scadenza non è rimasta accanto alla nuova`);
}
// e il limite dichiarato nel budget deve essere quello REALE, o il conto è finto
const vercel = JSON.parse(src('vercel.json'));
for (const f of ['api/leads/scan-inbox.js', 'api/pfs/scan-inbox.js',
                 'api/segretaria/scan-replies.js', 'api/employees/commerciale.js']) {
  ok((vercel.functions[f] || {}).maxDuration === 60,
    `${f}: vercel.json dichiara davvero 60s (il budget ci si appoggia)`);
}

// ── 4. Il posto dove mettere il documento non si perde per un intoppo ──
// Dai log del 31/08: `[fiscal/valutazione] Storage upload failed (503)`. Un
// 503 di Google Cloud Storage è momentaneo — la loro stessa guida dice di
// riprovare — ma qui non si riprovava affatto. E da storageUpload passano il
// contratto firmato, il verbale delle chiavi, il fascicolo fiscale, il
// rendiconto al proprietario e l'archivio della conservazione.
{
  const { storageUpload } = await import('../../api/agent/_lib.js');
  process.env.FIREBASE_STORAGE_BUCKET = 'test-bucket';
  const vero = globalThis.fetch;
  let chiamate = [];
  const conRisposte = (codici) => {
    chiamate = [];
    globalThis.fetch = async (u, o) => {
      // il token admin passa da identitytoolkit: non è l'upload
      if (!String(u).includes('firebasestorage')) return new Response(JSON.stringify({ idToken: 'x' }), { status: 200 });
      const c = codici[Math.min(chiamate.length, codici.length - 1)];
      chiamate.push({ url: String(u), status: c });
      return c === 200
        ? new Response(JSON.stringify({ downloadTokens: 'tok' }), { status: 200 })
        : new Response('boom', { status: c });
    };
  };

  conRisposte([503, 503, 200]);
  const url = await storageUpload('a/b.pdf', Buffer.from('x')).catch((e) => 'ERRORE: ' + e.message);
  ok(typeof url === 'string' && url.includes('token=tok'),
    'due 503 di fila e il documento si salva comunque al terzo colpo (prima si perdeva)');
  ok(chiamate.length === 3, 'esattamente tre tentativi, non di più');

  conRisposte([403]);
  const neg = await storageUpload('a/b.pdf', Buffer.from('x')).catch((e) => e.message);
  ok(/403/.test(String(neg)), 'un 403 fallisce SUBITO');
  ok(chiamate.length === 1,
    'e non si riprova: un permesso negato non si aggiusta aspettando, e ripetere ruba secondi alla funzione');

  conRisposte([500, 500, 500]);
  const ko = await storageUpload('a/b.pdf', Buffer.from('x')).catch((e) => e.message);
  ok(/500/.test(String(ko)) && chiamate.length === 3, 'un guasto persistente resta un errore, dichiarato');

  globalThis.fetch = vero;
  const lib = src('api/agent/_lib.js');
  ok(/signal: sig\(/.test(lib), "e l'upload ha il suo tetto di tempo: appeso, non si mangia la funzione");
}

console.log(`\n${fail ? '✗' : '✓'} tempo: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
