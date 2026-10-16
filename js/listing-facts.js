/* js/listing-facts.js — I FATTI DI UNA CASA CHE SI POSSONO DIRE.
 *
 * Tre superfici raccontano la stessa casa a chi non esegue JavaScript (o a
 * un motore di risposta che cita): la scheda servita dal server
 * (api/listing.js), l'inventario in markdown (api/llms-listings.js) e il
 * concierge AI (api/ask-listing.js). Più la scheda stessa, nel browser.
 * Finché ognuna si scriveva le proprie regole, dicevano cose diverse:
 * l'inventario dichiarava «all-in» OGNI canone, la scheda diceva che le
 * utenze non sono incluse, e l'onorario compariva senza l'IVA che il codice
 * poi addebita davvero (api/preagreement/create.js: 10% del canone annuo
 * + IVA 22%).
 *
 * Qui le due regole in una copia sola:
 *
 *  billsIncluded(l)  vero SOLO se l'operatore ha messo l'etichetta sulla
 *                    casa (tags o features). Mai dalla descrizione libera:
 *                    «bills not included» contiene «bills … included», e
 *                    un testo scritto per vendere non è una dichiarazione.
 *                    Nel catalogo (design/pages-deco/case-full.json) 7 delle
 *                    18 case affittabili portano l'etichetta «All inclusive»
 *                    — una scritta «All invlusive»: il refuso è coperto.
 *
 *  agencyFeeEur(r)   l'onorario intero, IVA compresa, in euro tondi:
 *                    canone × 12 × 10% × 1,22. È lo stesso conto della
 *                    scheda (apartment-detail.html) e della proposta.
 *
 *  FEE_EN            la frase standard, identica ovunque.
 *
 * UMD come js/boom-geo.js: window.BOOM_FACTS nel browser,
 * `import FACTS from '../js/listing-facts.js'` da api/**.
 */
(function (root) {
  'use strict';

  var BILLS = /\ball[\s-]*in[cv]lusive\b|\b(bills?|utilities) included\b|\bspese incluse\b|\btutto incluso\b/i;

  function billsIncluded(l) {
    l = l || {};
    return [].concat(l.tags || [], l.features || []).some(function (t) {
      return BILLS.test(String(t));
    });
  }

  function agencyFeeEur(rent) {
    return Math.round(Number(rent) * 12 * 0.10 * 1.22);
  }

  var FEE_EN = "10% of one year's rent + 22% VAT, once";

  var API = { billsIncluded: billsIncluded, agencyFeeEur: agencyFeeEur, FEE_EN: FEE_EN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_FACTS = API;
})(typeof window !== 'undefined' ? window : this);
