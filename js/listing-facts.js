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

  // bedroomsOf(l) — le camere da letto, il campo STRUTTURATO prima.
  // Fino al 15/10/2026 ogni superficie leggeva `num(l.beds || l.bedrooms)`:
  // `beds` è il testo libero del bot («Living , 1 bedroom with balcony , 1
  // bedroom…», «1BR + Loft», «3» su un bilocale), e ne usciva il PRIMO
  // numero — «Capri 2 Bed» pubblicato come «1 bedroom», un bilocale di Via
  // dei Cappellari come «3 bedrooms». Ora: `bedrooms` intero 0–10 vince
  // (0 = monolocale: nessuna camera separata); il testo vale solo se il
  // campo manca, e solo per 1–10. Altrimenti null: meglio tacere.
  function bedroomsOf(l) {
    l = l || {};
    var b = l.bedrooms;
    if (b !== null && b !== undefined && String(b).trim() !== '') {
      var n = Number(String(b).trim());
      if (Number.isInteger(n) && n >= 0 && n <= 10) return n;
    }
    var m = String(l.beds == null ? '' : l.beds).match(/\d+/);
    if (m) {
      var k = parseInt(m[0], 10);
      if (k >= 1 && k <= 10) return k;
    }
    return null;
  }

  // furnishedOf(v) — l'arredo DICHIARATO nella forma che leggono i canali:
  // true · false · 'partial' (né sì né no, ed è vero) · null (non detto).
  // Il catalogo scrive 'yes' / 'no' / 'partial' (bot, portal) e a volte un
  // booleano storico. Fino al 15/10/2026 telefono e Pubblicista leggevano
  // SOLO il booleano: su ogni casa vera dicevano «arredo sconosciuto».
  // Un valore che non si capisce resta null: mai arrotondato.
  function furnishedOf(v) {
    if (v === true || v === false) return v;
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 'yes') return true;
    if (s === 'no') return false;
    if (s === 'partial') return 'partial';
    return null;
  }

  var API = { billsIncluded: billsIncluded, agencyFeeEur: agencyFeeEur, FEE_EN: FEE_EN, bedroomsOf: bedroomsOf, furnishedOf: furnishedOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_FACTS = API;
})(typeof window !== 'undefined' ? window : this);
