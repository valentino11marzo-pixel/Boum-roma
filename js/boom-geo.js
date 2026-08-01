/* js/boom-geo.js — QUANTO È VERO QUESTO PIN.
 *
 * Il bake dei geocodici registra già da dove viene ogni posizione, in
 * `listing.geo`:
 *     { src:'nominatim', q:'Via Appennini 33, Roma', at:'…' }   ← un palazzo
 *     { src:'nominatim', q:'Prati, Roma',            at:'…' }   ← un quartiere
 *     { src:'zone',      q:'zone:Centro Storico',    at:'…' }   ← un centroide
 *
 * Le pagine però leggevano `listing.geoZone`, un campo che NESSUN annuncio
 * porta (0 su 19 in produzione il 29/07/2026). Risultato: `exact` era sempre
 * vero, il prefisso "≈" non compariva mai e la legenda "◈ exact address ·
 * ≈ zone area" dello Skyline era decorativa. Tre case del centro dichiaravano
 * lo stesso centroide come se fosse il loro portone, e la scheda offriva
 * "Street View · the exact entrance" su una via a caso vicino a Navona.
 *
 * Qui la precisione si deduce da ciò che è stato REALMENTE geocodificato,
 * senza migrazioni sui dati. Tre livelli utili invece di un sì/no bugiardo:
 *
 *   exact   via + civico        → il portone. Coordinate e Street View ok.
 *   street  via senza civico    → la strada giusta, non il numero.
 *   zone    quartiere/centroide → onesto dirlo, mai spacciarlo per indirizzo.
 *   none    nessuna coordinata  → nessun pin, nessun chip.
 *
 * Usato dallo Skyline (apartments.html) e dalla scheda (apartment-detail.html)
 * così le due superfici non possono più raccontare cose diverse.
 */
(function (root) {
  'use strict';

  /* le parole con cui in Italia comincia un indirizzo vero */
  var STREET = /\b(via|viale|v\.le|piazza|p\.zza|piazzale|largo|vicolo|lungotevere|corso|borgo|salita|clivo|circonvallazione|passeggiata|ponte)\b/i;
  /* un civico: 1-4 cifre con eventuale lettera. Esclude il CAP a 5 cifre. */
  var CIVIC = /\b\d{1,4}[a-zA-Z]?\b/;

  function pinPrecision(l) {
    l = l || {};
    var lat = +l.lat, lng = +l.lng;
    if (!lat || !lng) return { level: 'none', exact: false, why: 'nessuna coordinata' };

    var g = l.geo || {};
    var src = String(g.src || '').toLowerCase();
    var q = String(g.q || '').trim();

    /* un bake di zona non è mai un palazzo, qualunque cosa dicano i decimali */
    if (src === 'zone' || /^zone:/i.test(q)) {
      return { level: 'zone', exact: false, why: 'centroide di quartiere' };
    }

    if (q) {
      var hasStreet = STREET.test(q);
      /* il civico si cerca fuori dal nome della città, e mai in un CAP */
      var hasCivic = CIVIC.test(q.replace(/\broma\b/ig, ''));
      if (hasStreet && hasCivic) return { level: 'exact', exact: true, why: 'via e civico' };
      if (hasStreet) return { level: 'street', exact: true, why: 'via senza civico' };
      /* "Prati, Roma" viene geocodificato benissimo… e cade sul quartiere */
      return { level: 'zone', exact: false, why: 'geocodifica del solo quartiere' };
    }

    /* nessuna provenienza registrata: si giudica dalla forma del numero.
       un centroide scritto a mano è corto e tondo, un geocodice è lungo. */
    var dec = Math.max(decimals(l.lat), decimals(l.lng));
    if (dec <= 4) return { level: 'zone', exact: false, why: 'coordinate arrotondate, nessuna provenienza' };
    return { level: 'street', exact: true, why: 'coordinate precise, provenienza ignota' };
  }

  function decimals(n) {
    var s = String(n);
    var i = s.indexOf('.');
    return i < 0 ? 0 : (s.length - i - 1);
  }

  /* Le parole, in un posto solo: se lo Skyline e la scheda le prendessero da
     due dizionari diversi finirebbero per contraddirsi di nuovo. */
  function pinCopy(level, zone) {
    var z = String(zone || 'Rome').replace(/\s+$/, '');
    switch (level) {
      case 'exact':  return { badge: 'Exact address',   note: 'Building-exact position',            street: true,  coords: true };
      case 'street': return { badge: 'This street',     note: 'The right street — not the number',  street: true,  coords: false };
      case 'zone':   return { badge: 'Zone area',       note: 'Approximate position in ' + z,       street: false, coords: false };
      default:       return { badge: '',                note: '',                                   street: false, coords: false };
    }
  }

  /* Quante case di un elenco possiamo mostrare come indirizzo vero. Serve al
     radar qualità e a decidere quando vale la pena rifare il bake. */
  function pinAudit(list) {
    var out = { exact: 0, street: 0, zone: 0, none: 0, total: 0 };
    (Array.isArray(list) ? list : []).forEach(function (l) {
      out[pinPrecision(l).level]++; out.total++;
    });
    return out;
  }

  var API = { pinPrecision: pinPrecision, pinCopy: pinCopy, pinAudit: pinAudit };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_GEO = API;
})(typeof window !== 'undefined' ? window : this);
