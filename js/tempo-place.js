/* js/tempo-place.js — I TUOI POSTI, UNA COPIA SOLA. window.BOOM_PLACE
 *
 * La scheda casa aveva già la promessa scritta sopra il suo box dei luoghi:
 * "your places — set them once, every home answers" (localStorage
 * 'boom:pois', {name,lat,lng}, max 4, il PRIMO è il posto principale).
 * Questa è la promessa mantenuta OVUNQUE: il catalogo (/apartments) mostra i
 * minuti veri su ogni card e ordina per il tuo posto, lo Skyline li scrive
 * sotto ogni pin e lascia scegliere il posto con un tap sull'ancora, la
 * scheda li usa per le righe personalizzate e il quiz /match salva
 * l'università all'uscita. UNA copia dello store — stessa disciplina di
 * boom-geo e _avail: due superfici non possono raccontare posti diversi.
 *
 * I PRESET non sono una lista nuova: si filtrano dalle anchors del city pack
 * (js/roma-transit.js) — un'ancora aggiunta lì compare ovunque da sola.
 * Niente qui dentro tocca la rete o il DOM: localStorage con guardia (Safari
 * privato LANCIA — la lezione di portal-app) e dati puri, testabili in node.
 */
(function (root) {
  'use strict';

  var KEY = 'boom:pois';
  var MAX = 4;

  function load() {
    try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function store(a) {
    try { localStorage.setItem(KEY, JSON.stringify((a || []).slice(0, MAX))); } catch (e) {}
  }
  /* aggiunge IN TESTA (diventa il posto principale); stesso nome = riordina,
     mai duplica. Il nome viene da un geocoder (dato aperto OSM): i caratteri
     che formano HTML si tolgono ALLA PORTA — i sink escapano comunque, ma la
     copia salvata non deve mai contenere markup. */
  function add(p) {
    if (!p || !p.name || !isFinite(+p.lat) || !isFinite(+p.lng)) return load();
    var name = String(p.name).replace(/[<>]/g, '').slice(0, 40).trim();
    if (!name) return load();
    var a = load().filter(function (x) { return x.name !== name; });
    a.unshift({ name: name, lat: +p.lat, lng: +p.lng });
    store(a);
    return a.slice(0, MAX);
  }
  function remove(name) {
    var a = load().filter(function (x) { return x.name !== name; });
    store(a);
    return a;
  }
  function primary() { return load()[0] || null; }

  /* i posti di una GIORNATA, dal pack: università, lavoro, hub, aeroporto,
     Vaticano. Fuori le ancore da tempo libero (Ostia, Trastevere by night,
     Colosseo): belle sulla mappa, ma nessuno ci va tutte le mattine. */
  function presets(pack) {
    var keep = { uni: 1, work: 1, hub: 1, travel: 1 };
    return (((pack || {}).anchors) || []).filter(function (a) {
      return keep[a.kind] || a.id === 'vaticano';
    }).map(function (a) {
      return { id: a.id, name: a.label, emoji: a.emoji, lat: a.lat, lng: a.lng };
    });
  }

  var API = { KEY: KEY, MAX: MAX, load: load, store: store, add: add, remove: remove, primary: primary, presets: presets };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_PLACE = API;
})(typeof window !== 'undefined' ? window : this);
