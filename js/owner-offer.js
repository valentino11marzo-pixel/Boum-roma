/* js/owner-offer.js — L'OFFERTA AI PROPRIETARI, in una copia sola.
 *
 * La vecchia /owners prometteva una «garanzia di solvibilità scritta nel
 * mandato» che il mandato generato dal portale non conteneva. Il difetto non
 * era una frase: era che il prezzo e le promesse vivevano DENTRO la pagina,
 * scritti a mano, senza niente che li confrontasse con ciò che si firma.
 * Qui vivono una volta sola; la pagina li legge (window.BOOM_OWNER_OFFER), e
 * tests/owners/run.mjs pretende che il pacchetto concordato coincida con
 * api/_catalog.js e che nessuna promessa «spenta» esca in pagina.
 *
 * Decisioni del fondatore (23/09/2026):
 *  - prima locazione: 0 € di provvigione per il proprietario (la provvigione
 *    di agenzia la paga l'inquilino — va detto: è il movente, e chi legge
 *    deve sapere da dove guadagniamo);
 *  - dalla seconda: mezza mensilità o una mensilità, decisa caso per caso e
 *    SCRITTA NEL MANDATO prima di iniziare;
 *  - pluriennale: fee annua fissa su preventivo, scontata rispetto alle
 *    provvigioni singole, con il SERVIZIO di registrazione incluso (le
 *    imposte no) — il flag che spegne la fattura ASPI è
 *    registrazioneInclusa (api/fiscal/_aspi.js);
 *  - i soldi: a scelta — diretti al proprietario, oppure incassati da BOOM e
 *    riversati nei termini del mandato;
 *  - garanzia sui canoni: NON esiste oggi. Si costruisce (studio in
 *    STUDIO_PROPRIETARI_2026-09.md), e finché stato !== 'attiva' la pagina
 *    non la vende.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_OWNER_OFFER = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OFFER = {
    aggiornata: '2026-09-23',
    iva: 0.22,
    primaLocazione: {
      provvigioneProprietario: 0,
      pagaInquilino: true,
      // api/preagreement/create.js: feeMode pct, default 10% del canone
      // annuo, IVA 22% — è la prassi, e la console può cambiarla deal per deal.
      provvigioneInquilinoDefaultPct: 10,
    },
    successive: {
      mensilita: [0.5, 1],
      regola: 'caso per caso, scritta nel mandato prima di iniziare',
    },
    pluriennale: {
      suPreventivo: true,
      include: ['la gestione della locazione', 'il servizio di registrazione e attestazione', 'il rendiconto mensile'],
      esclude: ['imposta di registro e bolli, se dovuti'],
    },
    incasso: {
      // null = il termine è quello scritto nel mandato (nessun numero in
      // pagina finché non è deciso e firmabile).
      riversamentoGiorniLavorativi: null,
    },
    garanzia: {
      // 'costruzione' | 'attiva'. Solo 'attiva' può comparire come prodotto.
      stato: 'costruzione',
    },
    // Deve coincidere con api/_catalog.js 'concordato-pack'.eur (test).
    pacchettoConcordatoEur: 349,
  };

  function round2(n) { return Math.round(n * 100) / 100; }

  /** Una mensilità (o mezza) sul canone dichiarato, IVA compresa: il prezzo
   *  che un consumatore deve leggere tutto intero (art. 49 Cod. Consumo). */
  function provvigione(canoneMensile, mensilita) {
    var c = Number(canoneMensile), m = Number(mensilita);
    if (!(c > 0) || !(m > 0)) return null;
    var imponibile = round2(c * m);
    var iva = round2(imponibile * OFFER.iva);
    return { imponibile: imponibile, iva: iva, totale: round2(imponibile + iva) };
  }

  /** Cedolare secca annua: 21% libero, 10% concordato (Roma, comune ad alta
   *  tensione abitativa). Aritmetica di legge, non una stima. */
  function cedolare(canoneMensile, concordato) {
    var c = Number(canoneMensile);
    if (!(c > 0)) return null;
    return round2(c * 12 * (concordato ? 0.10 : 0.21));
  }

  /** Euro all'italiana, deterministico: toLocaleString con ICU ridotta
   *  stampa 1250 invece di 1.250 (la lezione di /executive). */
  function eur(n, dec) {
    if (n == null || !isFinite(n)) return '—';
    var d = dec == null ? (Math.round(n) === n ? 0 : 2) : dec;
    var s = Math.abs(n).toFixed(d).split('.');
    var int = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '−' : '') + int + (s[1] ? ',' + s[1] : '') + ' €';
  }

  return { OFFER: OFFER, provvigione: provvigione, cedolare: cedolare, eur: eur };
});
