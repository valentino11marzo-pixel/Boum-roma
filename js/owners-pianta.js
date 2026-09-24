/* js/owners-pianta.js — /owners: la salita (una volta, su un gesto), la
   stanza accesa, il sole NOAA calcolato una volta. UMD: window.BOOM_PIANTA.
   Il disegno lo scrive design/owners/pianta.mjs; qui classi e 2 poligoni. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BOOM_PIANTA = api;
})(typeof window !== 'undefined' ? window : globalThis, function (W) {
  'use strict';
  var R = Math.PI / 180;
  var STANZE = ['porta', 'cassaforte', 'soggiorno', 'cucina', 'scrivania', 'cassetta'];
  var fatto = false;

  // NOAA: azimut da nord (orario), elevazione apparente (con rifrazione).
  function posizioneSole(date, lat, lng) {
    lat = lat == null ? 41.9028 : lat; lng = lng == null ? 12.4964 : lng;
    var t = date.getTime(), T = (t / 864e5 + 2440587.5 - 2451545) / 36525;
    var L0 = (280.46646 + T * (36000.76983 + T * 3.032e-4)) % 360;
    var M = 357.52911 + T * (35999.05029 - 1.537e-4 * T);
    var e = 0.016708634 - T * (4.2037e-5 + 1.267e-7 * T);
    var C = Math.sin(M * R) * (1.914602 - T * (0.004817 + 1.4e-5 * T)) + Math.sin(2 * M * R) * (0.019993 - 1.01e-4 * T) + Math.sin(3 * M * R) * 2.89e-4;
    var om = (125.04 - 1934.136 * T) * R;
    var lam = (L0 + C - 0.00569 - 0.00478 * Math.sin(om)) * R;
    var eps = (23 + (26 + (21.448 - T * (46.815 + T * (5.9e-4 - T * 1.813e-3))) / 60) / 60 + 0.00256 * Math.cos(om)) * R;
    var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    var y = Math.tan(eps / 2); y *= y;
    var l2 = 2 * L0 * R, m1 = M * R;
    var eot = 4 / R * (y * Math.sin(l2) - 2 * e * Math.sin(m1) + 4 * e * y * Math.sin(m1) * Math.cos(l2) - 0.5 * y * y * Math.sin(2 * l2) - 1.25 * e * e * Math.sin(2 * m1));
    var min = ((t / 6e4) % 1440 + 1440) % 1440;
    var tst = ((min + eot + 4 * lng) % 1440 + 1440) % 1440;
    var ha = tst / 4 - 180, la = lat * R;
    var cz = Math.max(-1, Math.min(1, Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha * R)));
    var zen = Math.acos(cz), el = 90 - zen / R, te = Math.tan(el * R), rf = 0;
    if (el > 85) rf = 0;
    else if (el > 5) rf = 58.1 / te - 0.07 / Math.pow(te, 3) + 8.6e-5 / Math.pow(te, 5);
    else if (el > -0.575) rf = 1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)));
    else rf = -20.772 / te;
    el += rf / 3600;
    var az = 180, sz = Math.sin(zen);
    if (sz > 1e-9) {
      var a = Math.acos(Math.max(-1, Math.min(1, (Math.sin(la) * cz - Math.sin(dec)) / (Math.cos(la) * sz)))) / R;
      az = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
    }
    return { azimuth: az, elevation: el, hourAngle: ha };
  }

  function oraRoma(date) {
    try {
      return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
    } catch (e) {
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return p(date.getHours()) + ':' + p(date.getMinutes());
    }
  }

  // d = data-sole: lat,lng; n nord disegnato (gradi, orario dal su del
  // foglio); o normale della facciata; m = M; f finestre [x0,y0,x1,y1,z0,z1].
  function luceSole(date, d) {
    var sp = posizioneSole(date, d.lat, d.lng), ora = oraRoma(date), poli = [], stato;
    var th = (sp.azimuth + d.n) * R, ux = Math.sin(th), uy = -Math.cos(th);
    if (sp.elevation <= 0) stato = sp.hourAngle < 0 ? 'nonsorto' : 'tramontato';
    else if (ux * d.o[0] + uy * d.o[1] <= 0.02) stato = 'nonentra';
    else {
      stato = 'entra';
      var k = 1 / Math.tan(Math.max(sp.elevation, 1) * R), m = d.m;
      d.f.forEach(function (w) {
        poli.push([[w[0], w[1], w[4]], [w[2], w[3], w[4]], [w[2], w[3], w[5]], [w[0], w[1], w[5]]].map(function (p) {
          var x = p[0] - ux * p[2] * k, y = p[1] - uy * p[2] * k;
          return (m[0] * x + m[2] * y + m[4]).toFixed(1) + ',' + (m[1] * x + m[3] * y + m[5]).toFixed(1);
        }).join(' '));
      });
    }
    var frase = {
      entra: 'la luce entra come adesso',
      nonentra: "a quest'ora il sole non entra da questa finestra",
      tramontato: 'il sole è tramontato',
      nonsorto: 'il sole non è ancora sorto'
    }[stato];
    return { stato: stato, ora: ora, testo: 'Roma, ' + ora + ' · ' + frase, poligoni: poli, sole: sp };
  }

  function sole(r) {
    var svg = r.querySelector('svg.alzata'), g = svg && svg.querySelector('.sole');
    if (!g) return;
    var L = luceSole(new Date(), JSON.parse(svg.getAttribute('data-sole')));
    L.poligoni.forEach(function (p) {
      var e = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      e.setAttribute('points', p);
      g.appendChild(e);
    });
    var t = document.getElementById('soleDidas');
    if (t) t.textContent = L.testo;
  }

  // innesco: bottone | cartiglio | stanza
  function alza(innesco) {
    if (typeof document === 'undefined' || fatto) return false;
    var r = document.getElementById('riquadro'), h = document.documentElement;
    if (!r || h.classList.contains('flat')) return false;
    fatto = true;
    try { sole(r); } catch (e) { }
    var fermo = h.classList.contains('still') || !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var b = document.getElementById('alza'), et = r.querySelector('.et');
    if (b && document.activeElement === b && et) et.focus({ preventScroll: true });
    if (fermo) r.classList.add('alzata');
    else {
      r.classList.add('alzando');
      setTimeout(function () { r.classList.add('alzata'); r.classList.remove('alzando'); }, 1150);
    }
    if (typeof W.boomTrack === 'function') {
      try { W.boomTrack('owners_pianta_alzata', { innesco: innesco || 'bottone' }); } catch (e) { }
    }
    return true;
  }

  function accendi(stanza) {
    var r = typeof document !== 'undefined' && document.getElementById('riquadro');
    if (!r) return;
    if (stanza && STANZE.indexOf(stanza) >= 0) r.setAttribute('data-accesa', stanza);
    else r.removeAttribute('data-accesa');
  }

  return {
    alza: alza,
    accendi: accendi,
    alzata: function () { return fatto; },
    posizioneSole: posizioneSole,
    luceSole: luceSole,
    oraRoma: oraRoma,
    STANZE: STANZE
  };
});
