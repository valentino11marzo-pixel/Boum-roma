/* js/tempo-engine.js — IL MOTORE DEL TEMPO. window.BOOM_TEMPO
 *
 * Sostituisce il "km in linea d'aria × 4.2 + 10" che le pagine spacciavano
 * per door-to-door (il difetto documentato in CLAUDE.md). Qui il tempo si
 * CALCOLA sul grafo vero di un city pack (js/roma-transit.js per Roma):
 *
 *   porta → 🚶 fermata d'ingresso → attesa media (headway/2) → corsa
 *   (velocità di linea × distanza reale tra fermate) → eventuali cambi
 *   (penalità di stazione + attesa della nuova linea) → 🚶 porta.
 *
 * È una STIMA e lo dice sempre (ogni etichetta transit comincia con "≈"):
 * niente orari ufficiali, niente routing stradale — ma la geometria è quella
 * giusta, e "lungo la metro A voli, in trasversale no" finalmente si vede.
 *
 * Il motore è PURO: zero DOM, zero fetch, zero stato globale. Prende il pack
 * come argomento, quindi qualsiasi città con lo stesso schema funziona.
 * Deterministico per costruzione → testabile: node tests/tempo/run.mjs.
 *
 * API:
 *   buildGraph(pack)                      → G (una volta per pagina)
 *   plan(from, to, G)                     → { mode:'walk'|'transit', min,
 *                                             walkMin, legs[], rides[], approx }
 *   nearestStations(G, pt, n?, maxKm?)    → [{id,label,walkMin,km}]
 *   reachFrom(G, origin)                  → { arrive:{stationId:min}, origin }
 *   weekly(G, home, anchors[])            → { weekMin, per:[{label,plan,weekMin}] }
 *   label(plan)  · trace(plan)  · fmtMin(m)  · fmtWeekly(min)
 */
(function (root) {
  'use strict';

  var R = 6371, RAD = Math.PI / 180;
  function hav(la1, lo1, la2, lo2) {
    var dy = (la2 - la1) * RAD, dx = (lo2 - lo1) * RAD;
    var s = Math.sin(dy / 2) * Math.sin(dy / 2) +
            Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(dx / 2) * Math.sin(dx / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function walkMinutes(pack, km) { return km * pack.walking.detour / pack.walking.speedKmh * 60; }

  /* ── il grafo: nodi = (stazione § linea), archi = corse, cambi, corrispondenze ── */
  function buildGraph(pack) {
    var stations = {}, lines = {}, adj = {};
    pack.lines.forEach(function (L) { lines[L.id] = L; });
    pack.lines.forEach(function (L) {
      L.stops.forEach(function (s) {
        if (!stations[s[0]]) stations[s[0]] = { id: s[0], label: s[1], lat: s[2], lng: s[3], lines: [] };
        if (stations[s[0]].lines.indexOf(L.id) < 0) stations[s[0]].lines.push(L.id);
      });
    });
    function pk(st, li) { return st + '§' + li; }
    function edge(a, b, min, tag) { (adj[a] = adj[a] || []).push({ to: b, min: min, tag: tag }); }

    /* corse tra fermate consecutive, nei due sensi */
    pack.lines.forEach(function (L) {
      for (var i = 0; i < L.stops.length - 1; i++) {
        var A = L.stops[i], B = L.stops[i + 1];
        var min = hav(A[2], A[3], B[2], B[3]) / L.speedKmh * 60 + (L.dwellMin != null ? L.dwellMin : 0.5);
        edge(pk(A[0], L.id), pk(B[0], L.id), min, { ride: L.id, from: A[0], to: B[0] });
        edge(pk(B[0], L.id), pk(A[0], L.id), min, { ride: L.id, from: B[0], to: A[0] });
      }
    });

    /* cambio linea nella STESSA stazione: scendi + corridoio + attesa nuova linea */
    var X = (pack.transfer && pack.transfer.station) || {};
    var sameMin = (pack.transfer && pack.transfer.sameStationMin) != null ? pack.transfer.sameStationMin : 2;
    Object.keys(stations).forEach(function (sid) {
      var ls = stations[sid].lines;
      for (var i = 0; i < ls.length; i++) for (var j = 0; j < ls.length; j++) {
        if (i === j) continue;
        var w = X[sid] != null ? X[sid] : sameMin;
        edge(pk(sid, ls[i]), pk(sid, ls[j]), 0.5 + w + lines[ls[j]].headwayMin / 2,
          { xfer: sid, line: ls[j], walkMin: w });
      }
    });

    /* corrispondenze a piedi tra stazioni diverse: dichiarate + automatiche (<autoLinkKm) */
    var linked = {};
    function walkLink(a, b, wmin) {
      var A = stations[a], B = stations[b];
      if (!A || !B) return;
      A.lines.forEach(function (l1) {
        B.lines.forEach(function (l2) {
          edge(pk(a, l1), pk(b, l2), 0.5 + wmin + lines[l2].headwayMin / 2, { xfer: b, line: l2, walkMin: wmin });
          edge(pk(b, l2), pk(a, l1), 0.5 + wmin + lines[l1].headwayMin / 2, { xfer: a, line: l1, walkMin: wmin });
        });
      });
      linked[a + '|' + b] = linked[b + '|' + a] = true;
    }
    (pack.links || []).forEach(function (l) { walkLink(l[0], l[1], l[2]); });
    var ids = Object.keys(stations);
    var auto = (pack.walking && pack.walking.autoLinkKm) || 0.26;
    for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) {
      if (linked[ids[i] + '|' + ids[j]]) continue;
      var A2 = stations[ids[i]], B2 = stations[ids[j]];
      var km = hav(A2.lat, A2.lng, B2.lat, B2.lng);
      if (km <= auto) walkLink(ids[i], ids[j], Math.max(2, Math.round(walkMinutes(pack, km)) + 1));
    }

    return { pack: pack, stations: stations, lines: lines, adj: adj, pk: pk };
  }

  function nearestStations(G, pt, n, maxKm) {
    n = n || 5; maxKm = maxKm || G.pack.walking.maxAccessKm || 1.7;
    var out = [];
    for (var id in G.stations) {
      var s = G.stations[id];
      var km = hav(pt.lat, pt.lng, s.lat, s.lng);
      if (km <= maxKm) out.push({ id: id, label: s.label, km: km, walkMin: walkMinutes(G.pack, km) });
    }
    out.sort(function (a, b) { return a.walkMin - b.walkMin; });
    return out.slice(0, n);
  }

  /* Dijkstra semplice (≈300 nodi: la scansione lineare basta ed è deterministica) */
  function dijkstra(G, seeds) {
    var dist = {}, prev = {}, done = {};
    seeds.forEach(function (s) {
      if (dist[s.key] == null || s.cost < dist[s.key]) { dist[s.key] = s.cost; prev[s.key] = { seed: s }; }
    });
    for (;;) {
      var u = null, ud = Infinity;
      for (var k in dist) if (!done[k] && dist[k] < ud) { ud = dist[k]; u = k; }
      if (u == null) break;
      done[u] = true;
      var es = G.adj[u] || [];
      for (var i = 0; i < es.length; i++) {
        var e = es[i], nd = ud + e.min;
        if (dist[e.to] == null || nd < dist[e.to] - 1e-9) { dist[e.to] = nd; prev[e.to] = { from: u, edge: e }; }
      }
    }
    return { dist: dist, prev: prev };
  }

  function seedsFrom(G, origin, entries) {
    var W = G.pack.walking, seeds = [];
    entries.forEach(function (e) {
      G.stations[e.id].lines.forEach(function (li) {
        seeds.push({
          key: G.pk(e.id, li),
          cost: e.walkMin + (W.accessMin || 0) + G.lines[li].headwayMin / 2,
          station: e.id, walkMin: e.walkMin, line: li
        });
      });
    });
    return seeds;
  }

  /* porta → porta. Sceglie il meglio tra camminata pura e percorso sul grafo. */
  function plan(from, to, G, opts) {
    opts = opts || {};
    var W = G.pack.walking;
    var crow = hav(from.lat, from.lng, to.lat, to.lng);
    var walkMin = walkMinutes(G.pack, crow);
    var walkRes = {
      mode: 'walk', approx: true,
      min: Math.max(1, Math.round(walkMin)), walkMin: Math.max(1, Math.round(walkMin)),
      km: Math.round(crow * W.detour * 10) / 10, rides: [],
      legs: [{ kind: 'walk', min: Math.max(1, Math.round(walkMin)) }]
    };
    if (walkMin <= (opts.walkAlwaysMin != null ? opts.walkAlwaysMin : 11)) return walkRes;

    var ent = nearestStations(G, from, opts.nEntry || 5, opts.maxEntryKm);
    var ext = nearestStations(G, to, opts.nEntry || 5, opts.maxEntryKm);
    if (!ent.length || !ext.length) return walkRes;

    var D = dijkstra(G, seedsFrom(G, from, ent));
    var best = null;
    ext.forEach(function (x) {
      G.stations[x.id].lines.forEach(function (li) {
        var k = G.pk(x.id, li), d = D.dist[k];
        if (d == null) return;
        var tot = d + 0.5 + (W.egressMin || 0) + x.walkMin;
        if (!best || tot < best.tot) best = { tot: tot, key: k, exit: x };
      });
    });
    if (!best || best.tot >= walkMin - 2) return walkRes;

    /* ricostruzione → tappe leggibili */
    var chain = [], cur = best.key;
    while (cur && D.prev[cur] && !D.prev[cur].seed) { chain.push(D.prev[cur].edge); cur = D.prev[cur].from; }
    var seed = (D.prev[cur] || {}).seed || { walkMin: 0, station: cur ? cur.split('§')[0] : '' };
    chain.reverse();

    var legs = [], rides = [];
    if (seed.walkMin > 0.5) legs.push({ kind: 'walk', min: Math.round(seed.walkMin), to: (G.stations[seed.station] || {}).label });
    var run = null;
    function flushRun() {
      if (!run) return;
      var L = G.lines[run.line];
      var ride = {
        kind: 'ride', line: run.line, name: L.name, short: L.short, color: L.color,
        from: (G.stations[run.from] || {}).label, to: (G.stations[run.to] || {}).label,
        stops: run.stops, min: Math.round(run.min)
      };
      legs.push(ride); rides.push(ride); run = null;
    }
    chain.forEach(function (e) {
      if (e.tag.ride) {
        if (run && run.line === e.tag.ride) { run.to = e.tag.to; run.stops++; run.min += e.min; }
        else { flushRun(); run = { line: e.tag.ride, from: e.tag.from, to: e.tag.to, stops: 1, min: e.min }; }
      } else if (e.tag.xfer) {
        flushRun();
        legs.push({ kind: 'xfer', at: (G.stations[e.tag.xfer] || {}).label, min: Math.round(e.min) });
      }
    });
    flushRun();
    if (best.exit.walkMin > 0.5) legs.push({ kind: 'walk', min: Math.round(best.exit.walkMin) });

    return {
      mode: 'transit', approx: true,
      min: Math.max(1, Math.round(best.tot)), walkMin: walkRes.min,
      legs: legs, rides: rides
    };
  }

  /* tempi d'ARRIVO a ogni stazione partendo da un punto (per gli aloni di
     raggiungibilità): a piedi se vicina, altrimenti via grafo. */
  function reachFrom(G, origin, opts) {
    var ent = nearestStations(G, origin, (opts && opts.nEntry) || 6, (opts && opts.maxEntryKm));
    var arrive = {};
    ent.forEach(function (e) { arrive[e.id] = Math.round(e.walkMin); });
    if (ent.length) {
      var D = dijkstra(G, seedsFrom(G, origin, ent));
      for (var id in G.stations) {
        var bst = null;
        G.stations[id].lines.forEach(function (li) {
          var d = D.dist[G.pk(id, li)];
          if (d != null && (bst == null || d < bst)) bst = d;
        });
        if (bst != null) {
          var a = Math.round(bst + 0.5);
          if (arrive[id] == null || a < arrive[id]) arrive[id] = a;
        }
      }
    }
    return { origin: origin, arrive: arrive };
  }

  /* ore/settimana della tua vita: Σ andata+ritorno × frequenza, per ancora */
  function weekly(G, home, anchors) {
    var per = (anchors || []).map(function (a) {
      var p = plan(home, a, G);
      var f = a.perWeek != null ? a.perWeek : 1;
      return { id: a.id, label: a.label, emoji: a.emoji, perWeek: f, plan: p, weekMin: p.min * 2 * f };
    });
    var tot = per.reduce(function (s, x) { return s + x.weekMin; }, 0);
    return { weekMin: tot, per: per };
  }

  /* ── le parole (un posto solo, così le superfici non si contraddicono) ── */
  function fmtMin(m) { return Math.round(m) + '′'; }
  function fmtWeekly(min) {
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? h + 'h ' + (m < 10 ? '0' : '') + m + '′' : m + '′';
  }
  function label(p) {
    if (!p) return '';
    if (p.mode === 'walk') return fmtMin(p.min) + ' walk';
    var lineTxt = p.rides.map(function (r) { return r.short; }).join('+');
    return '≈' + fmtMin(p.min) + (lineTxt ? ' · ' + lineTxt : '');
  }
  function trace(p) {
    if (!p) return [];
    if (p.mode === 'walk') return [fmtMin(p.min) + ' walk'];
    return p.legs.map(function (l) {
      if (l.kind === 'walk') return fmtMin(l.min) + ' walk' + (l.to ? ' → ' + l.to : '');
      if (l.kind === 'xfer') return 'change at ' + l.at;
      return l.name + ' ' + l.from + ' → ' + l.to + ' · ' + l.stops + (l.stops === 1 ? ' stop' : ' stops') + ' · ' + fmtMin(l.min);
    });
  }

  var API = {
    buildGraph: buildGraph, plan: plan, nearestStations: nearestStations,
    reachFrom: reachFrom, weekly: weekly,
    label: label, trace: trace, fmtMin: fmtMin, fmtWeekly: fmtWeekly, hav: hav
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_TEMPO = API;
})(typeof window !== 'undefined' ? window : this);
