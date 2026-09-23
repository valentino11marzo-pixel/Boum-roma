/* js/owners-foglio.js — IL FOGLIO VIVO DEL CANONE di /owners.
 *
 * Esce solo a cancello P0-canone aperto (html[data-canone="aperto"], cioè
 * js/owner-offer.js OFFER.canone.verificato === true): finché l'associazione
 * non ha confermato la tabella delle zone, la pagina non stampa un tetto.
 * Il conto è quello di js/canone-engine.js (window.BOOM_CANONE), lo stesso
 * motore della scheda ufficiale: qui non c'è una seconda aritmetica, c'è
 * solo come la si dice. La parte pura (conto) si prova in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_FOGLIO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function eur(n) {
    if (n == null || !isFinite(n)) return '—';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
  }
  function mq2(n) { return (Math.round(n * 100) / 100).toFixed(2).replace('.', ','); }

  /** Il conto, puro: zona dell'accordo, metri, tipo, dotazioni, pertinenze
   *  e (facoltativo) il canone che il proprietario chiederebbe a libero. */
  function conto(CAN, zona, mq, tipo, parIdx, extra, libero) {
    if (!CAN || !zona) return null;
    var e = extra || {};
    var r = CAN.computeCanone({ zona: zona, mq: mq, tipo: tipo, parIdx: parIdx || [],
      mqBal: e.mqBal, mqBox: e.mqBox, mqSc: e.mqSc });
    if (!r || !r.ok) return null;
    var max = Math.round(r.cMax);
    var lib = Number(libero) > 0 ? Math.round(Number(libero)) : 0;
    return {
      sc: r.sc, nP: r.nP, fascia: r.fascia, max: max,
      nettoConcordato: Math.round(max * 0.90),
      sfora: lib > max ? lib - max : 0,
      libero: lib || null,
      nettoLibero: lib ? Math.round(lib * 0.79) : null,
    };
  }

  function righe(c) {
    if (!c) return [];
    var out = [
      ['Superficie convenzionale', mq2(c.sc) + ' m²'],
      ['Dotazioni', c.nP + ' su 20 → fascia ' + c.fascia],
      ['Canone ammesso', 'fino a ' + eur(c.max) + ' al mese'],
      ['Con la cedolare al 10%', 'ti restano ' + eur(c.nettoConcordato) + ' al mese'],
      ['IMU', 'al 75%, con l\'attestazione'],
    ];
    if (c.libero) {
      if (c.sfora) out.push(['Il canone che hai scritto', 'sfora di ' + eur(c.sfora) + ': con questi contratti non si può chiedere']);
      out.push(['Confronto col 4+4 libero (che non facciamo)', 'a ' + eur(c.libero) + ' con la cedolare al 21% ti resterebbero ' + eur(c.nettoLibero)
        + ' al mese; col concordato a ' + eur(c.max) + ' e il 10%, ' + eur(c.nettoConcordato) + '.']);
    }
    return out;
  }

  function avvia(doc) {
    var d = doc || document;
    var foglio = d.getElementById('foglio');
    var CAN = typeof window !== 'undefined' && window.BOOM_CANONE;
    if (!foglio || !CAN) return false;
    var $ = function (id) { return d.getElementById(id); };
    var ultimo = null;
    function zona() {
      var z = $('zona'), cod = z && z.value && z.value !== '__wa' ? z.value : 'C40';
      for (var i = 0; i < CAN.ZONES.length; i++) if (CAN.ZONES[i].cod === cod) return CAN.ZONES[i];
      return null;
    }
    function metri() { var m = parseInt(($('mq') || {}).value, 10); return m >= 15 && m <= 1000 ? m : 70; }
    function num(id) { var v = parseInt(($(id) || {}).value, 10); return v > 0 ? v : 0; }
    function calcola() {
      var z = zona(), m = metri();
      var tipo = (foglio.querySelector('input[name=fgTipo]:checked') || {}).value || 'stud';
      var par = [];
      var cb = foglio.querySelectorAll('input[data-par]');
      for (var i = 0; i < cb.length; i++) if (cb[i].checked) par.push(+cb[i].getAttribute('data-par'));
      var c = conto(CAN, z, m, tipo, par, { mqBal: num('fgBal'), mqBox: num('fgBox'), mqSc: num('fgSc') }, num('fgLibero'));
      var opt = $('zona') && $('zona').selectedOptions && $('zona').selectedOptions[0];
      var nome = z ? (opt && opt.value === z.cod ? opt.textContent.split(' · ')[0] : 'Prati') : '';
      $('fgZona').textContent = nome + ' (' + (z ? z.cod : '') + ') · ' + m + ' m²';
      var dl = $('fgEsito');
      dl.innerHTML = '';
      righe(c).forEach(function (r) {
        var dt = d.createElement('dt'), dd = d.createElement('dd');
        dt.textContent = r[0]; dd.textContent = r[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      ultimo = c && { cod: z.cod, nome: nome, mq: m, tipo: tipo, max: c.max, nP: c.nP, fascia: c.fascia };
      if (ultimo) d.dispatchEvent(new CustomEvent('owners:canone', { detail: ultimo }));
    }
    foglio.addEventListener('change', calcola);
    foglio.addEventListener('input', calcola);
    var cz = $('zona'), cm = $('mq');
    if (cz) cz.addEventListener('change', calcola);
    if (cm) cm.addEventListener('change', calcola);
    $('fgTieni').addEventListener('click', function () {
      if (ultimo) d.dispatchEvent(new CustomEvent('owners:tieni', { detail: ultimo }));
      var u = $('uscita'); if (u) u.scrollIntoView({ block: 'start' });
      var n = $('fName'); if (n) try { n.focus({ preventScroll: true }); } catch (e) {}
    });
    $('fgManda').addEventListener('click', function () {
      if (!ultimo) return;
      var t = 'Casa a Roma, ' + ultimo.nome + ' (zona ' + ultimo.cod + '), ' + ultimo.mq + ' m²: a canone concordato fino a '
        + eur(ultimo.max) + ' al mese (stima BOOM da confermare con la scheda). ' + location.origin + '/owners?z=' + ultimo.cod + '&mq=' + ultimo.mq;
      if (navigator.share) { navigator.share({ text: t }).catch(function () {}); return; }
      window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
    });
    calcola();
    return true;
  }

  if (typeof document !== 'undefined' && typeof module === 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { avvia(); });
    else avvia();
  }
  return { conto: conto, righe: righe, avvia: avvia };
});
