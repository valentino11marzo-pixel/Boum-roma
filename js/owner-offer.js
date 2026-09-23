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
      // base, durata minima, recesso, ISTAT, esempio su 10 unità: la scrive
      // il fondatore; finché è null la pagina dice «su preventivo».
      struttura: null,
    },
    incasso: {
      // null = il termine è quello scritto nel mandato (nessun numero in
      // pagina finché non è deciso e firmabile).
      riversamentoGiorniLavorativi: null,
      // La corsia che esiste oggi: incassiamo noi (carta, bonifico con la
      // causale della rata, SEPA) e riversiamo. «Li incassi tu» esce solo
      // quando c'è il backend (payoutMode, /casa in modalità diretta).
      direttoDisponibile: false,
      // Il conto dedicato ai soli canoni: null = non c'è, e la pagina lo
      // elenca fra le cose che non ci sono ancora.
      contoDedicato: null,
    },
    garanzia: {
      // 'costruzione' | 'attiva'. Solo 'attiva' può comparire come prodotto.
      stato: 'costruzione',
    },
    // Deve coincidere con api/_catalog.js 'concordato-pack'.eur (test).
    pacchettoConcordatoEur: 349,

    // IL CANCELLO P0-CANONE. Finché è false la pagina esce «senza numero»:
    // nessun tetto del concordato in pagina, nessun foglio vivo, nessuna
    // scheda nel pacchetto. Si apre quando ASPI ha confermato la tabella
    // delle zone (almeno quelle dove BOOM ha case) E il fondatore ha scritto
    // in notaCatalogo perché gli annunci concordato:true sopra il tetto lo
    // sono (tutto incluso, arredo, oppure errore corretto in vetrina) — il
    // 23/09 erano 12, fra cui Pigneto 100 m² a 2.000 € contro 1.310 €.
    canone: {
      verificato: false,
      aspiConfermataIl: null,   // 'YYYY-MM-DD'
      zone: [],                 // codici confermati, es. ['C40','C30']
      notaCatalogo: null,
    },

    // LE REGOLE DELLO ZERO — PROPOSTA in attesa di conferma del fondatore
    // (P0 n. 1): la pagina stampa questo testo nella FAQ «Che cosa conta
    // come prima locazione?», e non si pubblica finché confermate !== true.
    regole: {
      confermate: false,
      perImmobile: true,
      rinnovoStessoInquilinoGratis: true,
    },

    // Le pratiche fuori dal pluriennale: DEVONO coincidere con
    // ASPI_DEFAULTS (api/fiscal/_aspi.js) — tests/owners lo pretende.
    pratiche: { registrazioneEur: 89, attestazioneEur: 189 },

    mandato: {
      // Il PDF del mandato coi prezzi di questa pagina (P0 n. 3). Finché è
      // null, in pagina non c'è il link e non c'è la FAQ sul recesso.
      pdf: null,
      recessoPreavvisoGiorni: null,
    },

    // Le prove che la pagina stampa SOLO quando qualcuno le ha aperte.
    prova: {
      google: { url: null, stelle: null, recensioni: null, lettoIl: null },
    },
    referente: null,            // { nome, sostituto }
    polizzaRC: null,            // { compagnia, numero }
    emailPubblica: 'hello@boom-rome.com',
    telefono: '+39 331 325 1961',
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

  /** La provvigione della prima locazione a carico dell'inquilino, IVA
   *  compresa: pct% del canone di un anno. È l'esempio della tabella. */
  function provvigioneInquilino(canoneMensile, pct) {
    var c = Number(canoneMensile), p = pct == null ? OFFER.primaLocazione.provvigioneInquilinoDefaultPct : Number(pct);
    if (!(c > 0) || !(p > 0)) return null;
    var imponibile = round2(c * 12 * p / 100);
    var iva = round2(imponibile * OFFER.iva);
    return { imponibile: imponibile, iva: iva, totale: round2(imponibile + iva) };
  }

  /** LE RIGHE DEL MANDATO che rendono vera la pagina /owners. Il template
   *  «Mandato di Gestione» del portale (js/portal-app.js, mandato_gestione)
   *  le stampa così come escono di qui: la pagina e il mandato non possono
   *  dire due prezzi diversi, perché li scrive la stessa funzione.
   *  o = { modello: 'prima'|'pluriennale', successive: 0.5|1,
   *        feeAnnua (€ + IVA, solo pluriennale), riversamentoGiorni, recessoGiorni } */
  function mandatoRighe(o) {
    o = o || {};
    var r = [];
    var pct = OFFER.primaLocazione.provvigioneInquilinoDefaultPct;
    var succ = Number(o.successive) === 1 ? 'una mensilità' : 'mezza mensilità';
    if (o.modello === 'pluriennale') {
      var fee = Number(o.feeAnnua);
      r.push('Accordo pluriennale: compenso annuo fisso di ' + (fee > 0 ? eur(fee) : '€ ________') + ' più IVA, comprensivo della gestione della locazione, del servizio di registrazione del contratto e di attestazione del canone concordato e del rendiconto mensile.');
      r.push('Restano a carico del mandante le imposte (registro e bolli), se dovute.');
    } else {
      r.push('Prima locazione dell\'immobile: provvigione a carico del mandante pari a ' + eur(OFFER.primaLocazione.provvigioneProprietario) + '. La provvigione di agenzia è a carico del conduttore (di norma il ' + pct + '% del canone annuo più IVA) ed è indicata nella proposta che il conduttore sottoscrive.');
      r.push('Locazioni successive dello stesso immobile: ' + succ + ' del canone più IVA, per ogni nuova locazione.');
      if (OFFER.regole.rinnovoStessoInquilinoGratis) r.push('Il rinnovo del contratto con lo stesso conduttore non è una nuova locazione.');
      r.push('Servizi di registrazione del contratto e di attestazione del canone concordato: ' + eur(OFFER.pratiche.registrazioneEur) + ' e ' + eur(OFFER.pratiche.attestazioneEur) + ', IVA compresa. Le imposte (registro e bolli), se dovute, restano a carico delle parti secondo legge.');
    }
    var g = Number(o.riversamentoGiorni);
    if (g > 0) r.push('I canoni incassati dal mandatario per conto del mandante sono somme di terzi e sono riversati al mandante entro ' + g + ' giorni lavorativi dall\'incasso.');
    var d = Number(o.recessoGiorni);
    if (d > 0) r.push('Ciascuna parte può recedere dal mandato con un preavviso di ' + d + ' giorni. I contratti di locazione già stipulati restano validi.');
    if (OFFER.garanzia.stato !== 'attiva') r.push('Il presente mandato non contiene garanzie sul pagamento dei canoni da parte del conduttore.');
    return r;
  }

  return { OFFER: OFFER, provvigione: provvigione, provvigioneInquilino: provvigioneInquilino, cedolare: cedolare, eur: eur, mandatoRighe: mandatoRighe };
});
