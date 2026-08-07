// tests/journey/review-url.mjs
// REVIEW_URL finisce dentro le email al cliente (T+3 e uscita). Un link
// sbagliato non fa rumore: l'email parte lo stesso, il bottone porta alla
// scheda invece che alle stelline, e le recensioni semplicemente non
// arrivano. Qui blindiamo quale forma è accettata.
//
//   node tests/journey/review-url.mjs

import { reviewUrl } from '../../api/journey/_run.js';

const CASES = [
  // valide: aprono DIRETTAMENTE il box "scrivi una recensione"
  ['https://g.page/r/CfcpUptbNnvZEBM/review',                        true,  'g.page/r/<id>/review (il profilo BOOM)'],
  ['https://g.page/r/CfcpUptbNnvZEBM/review/',                       true,  'stesso link con slash finale'],
  ['https://search.google.com/local/writereview?placeid=ChIJabc123', true,  'forma writereview?placeid='],

  // invalide: portano alla scheda, non al form
  ['https://maps.app.goo.gl/xYz123',                                 false, 'link "Condividi" di Maps'],
  ['https://www.google.com/maps/place/BOOM+Rome',                    false, 'scheda Maps'],
  ['https://g.page/boomrome',                                        false, 'profilo breve senza /review'],
  ['https://g.page/r/CfcpUptbNnvZEBM',                               false, 'manca /review in fondo'],
  ['http://g.page/r/CfcpUptbNnvZEBM/review',                         false, 'http invece di https'],
  ['javascript:alert(1)',                                            false, 'schema non http(s)'],
  ['',                                                               false, 'stringa vuota'],
  [undefined,                                                        false, 'variabile non impostata'],
];

let pass = 0, fail = 0;
for (const [input, expected, label] of CASES) {
  const accepted = reviewUrl(input) !== null;
  const ok = accepted === expected;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label} → ${accepted ? 'accettato' : 'rifiutato'}`);
  ok ? pass++ : fail++;
}

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mSolo un vero link "scrivi recensione" finisce nelle email.\x1b[0m');
