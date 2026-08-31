/* js/scalo-codes.js — I CODICI DI ROTTA DELLO SCALO (STUDIO_AVIATION, S7).
 *
 * Ogni scalo ha i suoi codici; BOOM li aveva sparsi (ROM nel manifesto di
 * apartments, BM nei codici portale PFS, i gate delle tessere). Qui vivono
 * in UNA copia — la disciplina di `_avail.js` e `contract-pdf.js` — letta
 * da pass-delivery, dalla pagina della visita (/viewing) e dal check-in
 * (/book), così tre superfici non possono chiamare la stessa zona con tre
 * sigle diverse.
 *
 * Le due regole, ereditate da `inferZone` (radar-engine):
 *   1. il codice esce SOLO dal lessico curato — nessun match → null, MAI
 *      una sigla inventata al volo (una sigla sbagliata su un biglietto è
 *      peggio di nessuna sigla);
 *   2. l'alias LUNGO batte il corto contenuto: "monti tiburtini" è TIB,
 *      non MON — si prova per lunghezza decrescente, a parole intere.
 *
 * `bmCode(id)` è il numero di volo della visita: un SOPRANNOME derivato
 * dall'id vero (deterministico, zero migrazioni — il pattern dei token
 * derivati), mai una chiave. Nei documenti resta l'id di sempre.
 */
(function (root) {
  'use strict';

  /* [alias visibile nel testo, codice] — ordinati poi per lunghezza */
  var ZONE_CODES = [
    ['CENTRO STORICO', 'CEN'],
    ['MONTI TIBURTINI', 'TIB'],
    ['PONTE MILVIO', 'PMV'],
    ['SAN GIOVANNI', 'SGV'],
    ['SAN LORENZO', 'SLO'],
    ['CONCA D’ORO', 'CDO'],
    ["CONCA D'ORO", 'CDO'],
    ['MONTEVERDE', 'MTV'],
    ['TRASTEVERE', 'TRA'],
    ['GARBATELLA', 'GAR'],
    ['NOMENTANO', 'NOM'],
    ['ESQUILINO', 'ESQ'],
    ['TESTACCIO', 'TES'],
    ['AVENTINO', 'AVE'],
    ['OSTIENSE', 'OST'],
    ['FLAMINIO', 'FLA'],
    ['AFRICANO', 'AFR'],
    ['TIBURTIN', 'TIB'],
    ['PIGNETO', 'PIG'],
    ['PARIOLI', 'PAR'],
    ['TRIESTE', 'TRI'],
    ['CENTRO', 'CEN'],
    ['MONTI', 'MON'],
    ['PRATI', 'PRA'],
    ['EUR', 'EUR']
  ].sort(function (a, b) { return b[0].length - a[0].length; });

  function zoneCode(txt) {
    var up = String(txt == null ? '' : txt).toUpperCase();
    if (!up) return null;
    for (var i = 0; i < ZONE_CODES.length; i++) {
      var alias = ZONE_CODES[i][0];
      /* parole intere: MONTEVERDE non contiene la parola MONTI */
      var at = up.indexOf(alias);
      while (at !== -1) {
        var before = at === 0 ? '' : up[at - 1];
        var after = up[at + alias.length] || '';
        if (!/[A-Z0-9]/.test(before) && !/[A-Z0-9]/.test(after)) return ZONE_CODES[i][1];
        at = up.indexOf(alias, at + 1);
      }
    }
    return null;
  }

  /* il numero di volo: soprannome DERIVATO dall'id vero, mai una chiave */
  function bmCode(id) {
    var s = String(id == null ? '' : id).replace(/[^a-zA-Z0-9]/g, '');
    if (!s) return null;
    return 'BM ' + s.slice(0, 4).toUpperCase();
  }

  var API = { ZONE_CODES: ZONE_CODES, zoneCode: zoneCode, bmCode: bmCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_SCALO = API;
})(typeof window !== 'undefined' ? window : this);
