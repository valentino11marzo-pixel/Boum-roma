// tests/ispettore/run.mjs — IL CANCELLO: nessun bottone morto in produzione.
//
// Lo strumento nato dallo STUDIO_ARSENALE_II diventa una guardia: quello che
// una volta era un'indagine («il pfs command ha problemi») ora è un controllo
// che gira a ogni push su TUTTE le pagine admin — bottoni che chiamano
// funzioni inesistenti, fetch verso API rimosse, getElementById su elementi
// che nessuno crea. È la classe del bug «d'Oro», resa impossibile da spedire.
import { inspectAll } from '../../scripts/ispettore.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

const res = inspectAll();
ok(res.length >= 15, `l'ispettore copre le console (${res.length} pagine — una nuova console entra in PAGES o non è protetta)`);
ok(!res.some((r) => r.missing), 'nessuna pagina dichiarata è sparita dal repo');

for (const r of res) {
  const problemi = [];
  if (r.deadFns.length) problemi.push('bottoni morti: ' + r.deadFns.join(', '));
  if (r.deadApi.length) problemi.push('API fantasma: ' + r.deadApi.join(', '));
  if (r.deadIds.length) problemi.push('id orfani: ' + r.deadIds.join(', '));
  ok(problemi.length === 0, r.page + (problemi.length ? ' — ' + problemi.join(' · ') : ''));
}

console.log(`\n${fail ? '✗' : '✓'} ispettore: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
