// tests/listen/run.mjs — IL CANALE MUTO (BoomPortal.listen).
//
// La lezione watchPAs, finalmente nella copia CONDIVISA: su WebKit
// incastrato un onSnapshot può non chiamare NÉ onData NÉ l'errore — il
// retry non scatta mai e la pagina resta vuota per sempre, senza un
// segnale. pfs-command ha 7 canali così; banca, team, salute e radar gli
// stessi. Prima di questa rete, "la plancia PFS ha problemi" su iPhone
// era spesso QUESTO: sezioni vuote su una pagina sana.
// Qui si guida la funzione VERA (estratta dal sorgente) con un canale
// finto: muto → la lettura one-shot arriva; vivo → la rete non spreca una
// lettura; disarmato → silenzio totale.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(ROOT, 'js/boom-portal.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── estrazione della funzione vera ──────────────────────────────────────
const m = src.match(/BP\.listen = function[\s\S]*?\n    \};/);
ok(!!m, 'BP.listen estratta dal sorgente');
const listen = eval('(' + m[0].replace('BP.listen = ', '').replace(/;\s*$/, '') + ')');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) canale MUTO → la lettura one-shot consegna i dati entro il tetto
{
  let got = null, gets = 0;
  const q = {
    onSnapshot: () => function () {},                 // mai un callback: il muto
    get: async () => { gets++; return 'SNAP_FALLBACK'; },
  };
  listen(q, (s) => { got = s; }, null, { fallbackMs: 50 });
  await wait(120);
  ok(got === 'SNAP_FALLBACK' && gets === 1, 'canale muto: la one-shot arriva (la pagina non resta mai vuota in silenzio)');
}

// 2) canale VIVO → la rete non spreca una lettura, e lo snapshot vero comanda
{
  let got = null, gets = 0;
  const q = {
    onSnapshot: (cb) => { setTimeout(() => cb('SNAP_LIVE'), 5); return function () {}; },
    get: async () => { gets++; return 'SNAP_FALLBACK'; },
  };
  listen(q, (s) => { got = s; }, null, { fallbackMs: 50 });
  await wait(120);
  ok(got === 'SNAP_LIVE' && gets === 0, 'canale vivo: nessuna lettura extra, comanda lo snapshot vero');
}

// 3) canale muto che APRE dopo la rete → lo snapshot fresco arriva comunque
{
  const seen = [];
  const q = {
    onSnapshot: (cb) => { setTimeout(() => cb('SNAP_LATE'), 90); return function () {}; },
    get: async () => 'SNAP_FALLBACK',
  };
  listen(q, (s) => seen.push(s), null, { fallbackMs: 40 });
  await wait(160);
  ok(seen[0] === 'SNAP_FALLBACK' && seen.includes('SNAP_LATE'),
    'prima la scialuppa, poi il canale che apre prende il comando');
}

// 4) disiscritto prima del tetto → silenzio totale (niente render fantasma)
{
  let got = null, gets = 0;
  const q = {
    onSnapshot: () => function () {},
    get: async () => { gets++; return 'SNAP_FALLBACK'; },
  };
  const un = listen(q, (s) => { got = s; }, null, { fallbackMs: 50 });
  un();
  await wait(120);
  ok(got === null && gets === 0, 'unsubscribe spegne anche la scialuppa');
}

// 5) il default resta 6s (nessun caller da toccare) e l'errore continua a ritentare
ok(/\|\| 6000/.test(m[0]), 'default 6s: i chiamanti esistenti guariscono senza cambiare una riga');
ok(/retries \+\+|retries\+\+/.test(m[0]) && /Math\.pow\(2, retries\)/.test(m[0]), 'il retry su errore resta identico');

console.log(`\n${fail ? '✗' : '✓'} listen: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
