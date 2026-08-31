// api/ops/gtfs-tempi.js — IL PENDOLARE: i tempi porta-a-porta VERI,
// calcolati sul GTFS statico di Roma Mobilità.
//
// La vetrina prometteva minuti in linea d'aria (km × 4.2 + 10): sbagliati a
// caso, perché Roma è anisotropa — lungo la metro voli, in trasversale no.
// Il sandbox di sviluppo non raggiunge romamobilita.it (stessa storia del
// feed Immobiliare): quindi IL SERVER PENSA — questo cron scarica il feed
// in produzione, costruisce il grafo del trasporto a FREQUENZE (attesa =
// metà headway misurato nella finestra 07–21, corsa = tempo medio fra
// fermate consecutive, cambi a piedi fra fermate vicine), fa un Dijkstra
// all'indietro da ognuna delle METE (Termini, Sapienza, LUISS…) e stampa
// una griglia ~300 m sulla città nel doc `publicGeo/tempi-roma` (lettura
// pubblica nelle rules, come il catalogo). Le pagine la leggono col motore
// condiviso js/tempi-engine.js e, dove la griglia non copre, DEGRADANO
// alla stima di prima dichiarata come tale — mai un numero inventato.
//
// Idempotente e a buon mercato sui rerun: doc più giovane di 6 giorni →
// esce subito (?force=1 per rigenerare). ?dry=1 calcola senza scrivere.
// ?stato=1 risponde solo con l'età del doc. Auth come i cron PFS.
// Heartbeat `teamHealth/pendolare` (allerta Telegram dopo 3 run falliti).
//
// Test: node tests/tempi/run.mjs — il fixture GTFS è uno zip STORE
// costruito con api/_zip.js e letto da api/_unzip.js (round-trip vero).

import { fsGet, fsPatch } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportEmployeeHealth } from '../employees/_lib.js';
import { zipEntries, streamEntryLines } from '../_unzip.js';
import TEMPI from '../../js/tempi-engine.js';

export const config = { maxDuration: 300 };

const FEED_URL = process.env.GTFS_ROMA_URL
  || 'https://romamobilita.it/sites/default/files/rome_static_gtfs.zip';
const DOC = 'publicGeo/tempi-roma';
const FRESCO_MS = 6 * 24 * 3600 * 1000;

// ── le manopole del modello (tutte dichiarate, nessuna magia) ───────────
export const MODELLO = {
  finestra: [7 * 3600, 21 * 3600], // il giorno in cui la città si muove
  camminoKmh: 4.8,                 // passo urbano
  tortuosita: 1.3,                 // linea d'aria → strade vere
  attesaMaxS: 900,                 // metà headway, ma mai oltre 15′
  salitaS: 30,                     // accesso alla banchina
  cambioS: 30,                     // penalità del cambio a piedi
  piediMaxM: 240,                  // archi a piedi fra fermate vicine
  metaRaggioM: 900,                // dalla meta si arriva a piedi fin qui
  cellaRaggioM: 600,               // dalla cella alle fermate intorno
  corsaMaxS: 45 * 60,              // una "corsa" più lunga è un dato sporco
  griglia: { lat0: 41.76, lng0: 12.35, dLat: 0.0027, dLng: 0.0036,
             righe: 89, colonne: 84 },
};

// ── attrezzi puri ───────────────────────────────────────────────────────
export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dy = (lat2 - lat1) * r, dx = (lng2 - lng1) * r;
  const s = Math.sin(dy / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dx / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function camminoS(metri, M) {
  return metri * M.tortuosita / (M.camminoKmh * 1000 / 3600);
}

/** CSV di GTFS: veloce quando non ci sono virgolette, corretto quando ci
 *  sono (i nomi delle fermate portano virgole). */
export function csvRiga(riga) {
  if (riga.indexOf('"') < 0) return riga.split(',');
  const out = []; let cur = '', dentro = false;
  for (let i = 0; i < riga.length; i++) {
    const ch = riga[i];
    if (dentro) {
      if (ch === '"') {
        if (riga[i + 1] === '"') { cur += '"'; i++; } else dentro = false;
      } else cur += ch;
    } else if (ch === '"') dentro = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
export function colonne(headerRiga, nomi) {
  const h = csvRiga(headerRiga.replace(/^\uFEFF/, ''));
  const idx = {};
  nomi.forEach((n) => { idx[n] = h.indexOf(n); });
  return idx;
}
function orarioS(t) { // 'H:MM:SS', anche oltre le 24
  if (!t) return null;
  const p = t.split(':');
  if (p.length < 2) return null;
  const s = (+p[0]) * 3600 + (+p[1]) * 60 + (+(p[2] || 0));
  return isFinite(s) ? s : null;
}

/** Il giorno campione: fra i prossimi 10 giorni si sceglie quello col
 *  maggior numero di servizi attivi, preferendo mar/mer/gio (a parità di
 *  conteggio vince il feriale, poi il più vicino). Regge sia i feed con
 *  calendar.txt sia quelli fatti di sole calendar_dates. */
export function scegliGiorno(calRows, dateRows, oggi) {
  const GIORNI = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday',
    'friday', 'saturday'];
  const eccezioni = new Map(); // 'YYYYMMDD' → Map(service → 1|2)
  for (const r of dateRows) {
    if (!eccezioni.has(r.date)) eccezioni.set(r.date, new Map());
    eccezioni.get(r.date).set(r.service_id, +r.exception_type);
  }
  let migliore = null;
  for (let d = 1; d <= 10; d++) {
    const g = new Date(oggi.getTime() + d * 864e5);
    const ymd = g.toISOString().slice(0, 10).replace(/-/g, '');
    const dow = GIORNI[g.getUTCDay()];
    const servizi = new Set();
    for (const r of calRows) {
      if (r[dow] === '1' && r.start_date <= ymd && ymd <= r.end_date)
        servizi.add(r.service_id);
    }
    const ecc = eccezioni.get(ymd);
    if (ecc) for (const [sid, tipo] of ecc) {
      if (tipo === 1) servizi.add(sid); else if (tipo === 2) servizi.delete(sid);
    }
    const feriale = g.getUTCDay() >= 2 && g.getUTCDay() <= 4 ? 1 : 0;
    const punti = servizi.size * 10 + feriale * 5 - d * 0.1;
    if (servizi.size && (!migliore || punti > migliore.punti))
      migliore = { data: ymd, servizi, punti };
  }
  return migliore; // null = feed illeggibile: il chiamante grida
}

/** Lo stato che macina stop_times in STREAMING: per ogni coppia di fermate
 *  consecutive della stessa corsa accumula il tempo di percorrenza, e per
 *  ogni partenza in finestra conta le salite (da cui l'headway). Le righe
 *  di GTFS sono raggruppate per trip e ordinate per sequenza: al cambio di
 *  trip lo stato si azzera; una sequenza che non cresce non produce archi. */
export function macinaCorse(trips, M) {
  const corse = new Map();   // 'rkey|a|b' → [sommaS, n]
  const salite = new Map();  // 'rkey|stop' → partenze in finestra
  let prev = null;           // { trip, stop, seq, dep }
  let righe = 0, dentro = 0;
  function riga(trip_id, arrS, depS, stop_id, seq) {
    righe++;
    const rkey = trips.get(trip_id);
    if (!rkey) { prev = null; return; }
    const inFinestra = depS != null
      && depS >= M.finestra[0] && depS <= M.finestra[1];
    if (inFinestra) {
      dentro++;
      const sk = rkey + '|' + stop_id;
      salite.set(sk, (salite.get(sk) || 0) + 1);
    }
    if (prev && prev.trip === trip_id && seq > prev.seq
        && arrS != null && prev.dep != null) {
      const corsa = arrS - prev.dep;
      if (corsa > 0 && corsa <= M.corsaMaxS
          && (inFinestra || (prev.dep >= M.finestra[0] && prev.dep <= M.finestra[1]))) {
        const ek = rkey + '|' + prev.stop + '|' + stop_id;
        const e = corse.get(ek);
        if (e) { e[0] += corsa; e[1]++; } else corse.set(ek, [corsa, 1]);
      }
    }
    prev = { trip: trip_id, stop: stop_id, seq, dep: depS != null ? depS : arrS };
  }
  return { riga, corse, salite, conta: () => ({ righe, dentro }) };
}

/** indice spaziale a celle per i vicini entro un raggio */
function spatial(punti, passoGradi) {
  const m = new Map();
  const k = (la, lo) => Math.floor(la / passoGradi) + '|' + Math.floor(lo / passoGradi);
  punti.forEach((p, i) => {
    const key = k(p.lat, p.lng);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(i);
  });
  return function vicini(lat, lng) {
    const out = [];
    const r0 = Math.floor(lat / passoGradi), c0 = Math.floor(lng / passoGradi);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const b = m.get((r0 + dr) + '|' + (c0 + dc));
      if (b) out.push(...b);
    }
    return out;
  };
}

/** Il grafo, già ROVESCIATO (serve il tempo VERSO la meta): nodi = fermate
 *  (0..S-1) + banchine linea-fermata; archi inversi con pesi in secondi. */
export function costruisciGrafo(fermate, corse, salite, M) {
  const finestraS = M.finestra[1] - M.finestra[0];
  const sIdx = new Map();
  fermate.forEach((f, i) => sIdx.set(f.id, i));
  const pIdx = new Map();
  let nNodi = fermate.length;
  const nodoP = (chiave) => {
    let i = pIdx.get(chiave);
    if (i == null) { i = nNodi++; pIdx.set(chiave, i); }
    return i;
  };
  const rev = [];
  const arco = (da, a, w) => {
    (rev[a] || (rev[a] = [])).push(da, w); // piatto: [nodo,peso,nodo,peso…]
  };
  // salita: fermata → banchina (attesa = metà headway, mai oltre il cap)
  for (const [sk, n] of salite) {
    const bar = sk.lastIndexOf('|');
    const stop = sk.slice(bar + 1);
    const s = sIdx.get(stop);
    if (s == null) continue;
    const attesa = Math.min(M.attesaMaxS, finestraS / (2 * n)) + M.salitaS;
    arco(s, nodoP(sk), attesa);
  }
  // corsa: banchina → banchina; discesa: banchina → fermata (gratis+30s)
  let archiCorsa = 0;
  for (const [ek, [somma, n]] of corse) {
    const p1 = ek.indexOf('|'), p2 = ek.lastIndexOf('|');
    const rkey = ek.slice(0, p1), a = ek.slice(p1 + 1, p2), b = ek.slice(p2 + 1);
    const sa = sIdx.get(a), sb = sIdx.get(b);
    if (sa == null || sb == null) continue;
    const pa = nodoP(rkey + '|' + a), pb = nodoP(rkey + '|' + b);
    arco(pa, pb, Math.max(30, somma / n));
    arco(pb, sb, 30);
    archiCorsa++;
  }
  // cambi a piedi fra fermate vicine
  const vicini = spatial(fermate, 0.003);
  let archiPiedi = 0;
  fermate.forEach((f, i) => {
    for (const j of vicini(f.lat, f.lng)) {
      if (j <= i) continue;
      const g = fermate[j];
      const d = haversineM(f.lat, f.lng, g.lat, g.lng);
      if (d > M.piediMaxM) continue;
      const w = camminoS(d, M) + M.cambioS;
      arco(i, j, w); arco(j, i, w);
      archiPiedi++;
    }
  });
  return { rev, sIdx, nNodi, nFermate: fermate.length,
    stats: { banchine: pIdx.size, archiCorsa, archiPiedi } };
}

/** Dijkstra sul grafo rovescio: semina = camminata fermata→meta, risultato
 *  = secondi VERSO la meta da ogni fermata. Heap binario, niente dipendenze. */
export function tempiVersoMeta(grafo, fermate, meta, M) {
  const dist = new Float64Array(grafo.nNodi).fill(Infinity);
  const heap = [];
  const push = (d, n) => {
    heap.push(d, n);
    let i = heap.length / 2 - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p * 2] <= heap[i * 2]) break;
      const td = heap[p * 2], tn = heap[p * 2 + 1];
      heap[p * 2] = heap[i * 2]; heap[p * 2 + 1] = heap[i * 2 + 1];
      heap[i * 2] = td; heap[i * 2 + 1] = tn;
      i = p;
    }
  };
  const pop = () => {
    const d = heap[0], n = heap[1];
    const ld = heap.pop(), ln = heap.pop();
    /* i due pop tolgono (nodo, poi distanza) dell'ULTIMA coppia:
       ld = nodo, ln = distanza — i nomi mentono, l'ordine no */
    if (heap.length) { heap[0] = ln; heap[1] = ld; }
    let i = 0;
    const N = heap.length / 2;
    while (true) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < N && heap[l * 2] < heap[m * 2]) m = l;
      if (r < N && heap[r * 2] < heap[m * 2]) m = r;
      if (m === i) break;
      const td = heap[m * 2], tn = heap[m * 2 + 1];
      heap[m * 2] = heap[i * 2]; heap[m * 2 + 1] = heap[i * 2 + 1];
      heap[i * 2] = td; heap[i * 2 + 1] = tn;
      i = m;
    }
    return [d, n];
  };
  fermate.forEach((f, i) => {
    const d = haversineM(f.lat, f.lng, meta.lat, meta.lng);
    if (d <= M.metaRaggioM) { dist[i] = camminoS(d, M); push(dist[i], i); }
  });
  while (heap.length) {
    const [d, n] = pop();
    if (d > dist[n]) continue;
    const adj = grafo.rev[n];
    if (!adj) continue;
    for (let k = 0; k < adj.length; k += 2) {
      const nd = d + adj[k + 1];
      if (nd < dist[adj[k]]) { dist[adj[k]] = nd; push(nd, adj[k]); }
    }
  }
  return dist; // le prime nFermate posizioni sono le fermate
}

/** La griglia: per ogni cella il MEGLIO fra andarci a piedi e prendere un
 *  mezzo da una fermata vicina. Fuori copertura = '~' (mai inventare). */
export function costruisciGriglia(fermate, distPerMeta, M) {
  const G = M.griglia;
  /* passo ≥ raggio/82600 (m per grado di lng a Roma): sotto, una fermata
     al limite del raggio cadrebbe due celle più in là e sparirebbe */
  const vicini = spatial(fermate, 0.0075);
  const griglie = {};
  for (const m of TEMPI.METE) griglie[m.slug] = [];
  for (let r = 0; r < G.righe; r++) {
    const lat = G.lat0 + (r + 0.5) * G.dLat;
    for (let c = 0; c < G.colonne; c++) {
      const lng = G.lng0 + (c + 0.5) * G.dLng;
      const intorno = [];
      for (const j of vicini(lat, lng)) {
        const f = fermate[j];
        const d = haversineM(lat, lng, f.lat, f.lng);
        if (d <= M.cellaRaggioM) intorno.push([j, camminoS(d, M)]);
      }
      for (const m of TEMPI.METE) {
        const dist = distPerMeta[m.slug];
        let best = camminoS(haversineM(lat, lng, m.lat, m.lng), M);
        for (const [j, piedi] of intorno) {
          const t = piedi + dist[j];
          if (t < best) best = t;
        }
        griglie[m.slug].push(TEMPI.codifica(best / 60));
      }
    }
  }
  for (const m of TEMPI.METE) griglie[m.slug] = griglie[m.slug].join('');
  return griglie;
}

// ── il giro intero sul feed (bytes → doc) — esportato per il fixture ────
export async function costruisciDaZip(buf, oggi, M = MODELLO) {
  const voci = zipEntries(buf);
  const voce = (n) => voci.find((e) => e.name === n)
    || voci.find((e) => e.name.endsWith('/' + n)) || null;
  async function tabella(nome, campi, perRiga) {
    const e = voce(nome);
    if (!e) return 0;
    let idx = null, n = 0;
    await streamEntryLines(buf, e, (riga) => {
      if (!riga) return;
      if (!idx) { idx = colonne(riga, campi); return; }
      const c = csvRiga(riga);
      perRiga(c, idx); n++;
    });
    return n;
  }

  // calendario → il giorno campione
  const calRows = [], dateRows = [];
  await tabella('calendar.txt', ['service_id', 'monday', 'tuesday', 'wednesday',
    'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    (c, i) => calRows.push({ service_id: c[i.service_id],
      monday: c[i.monday], tuesday: c[i.tuesday], wednesday: c[i.wednesday],
      thursday: c[i.thursday], friday: c[i.friday], saturday: c[i.saturday],
      sunday: c[i.sunday], start_date: c[i.start_date], end_date: c[i.end_date] }));
  await tabella('calendar_dates.txt', ['service_id', 'date', 'exception_type'],
    (c, i) => dateRows.push({ service_id: c[i.service_id], date: c[i.date],
      exception_type: c[i.exception_type] }));
  const giorno = scegliGiorno(calRows, dateRows, oggi);
  if (!giorno) throw new Error('gtfs: nessun servizio attivo nei prossimi 10 giorni');

  // trips → trip_id → linea|direzione (solo i servizi del giorno campione)
  const trips = new Map();
  await tabella('trips.txt', ['trip_id', 'route_id', 'service_id', 'direction_id'],
    (c, i) => {
      if (!giorno.servizi.has(c[i.service_id])) return;
      const dir = i.direction_id >= 0 ? (c[i.direction_id] || '0') : '0';
      trips.set(c[i.trip_id], c[i.route_id] + '_' + dir);
    });
  if (!trips.size) throw new Error('gtfs: zero corse nel giorno campione');

  // fermate con coordinate
  const fermate = [];
  await tabella('stops.txt', ['stop_id', 'stop_lat', 'stop_lon', 'location_type'],
    (c, i) => {
      if (i.location_type >= 0 && c[i.location_type]
          && c[i.location_type] !== '0') return; // stazioni-madre, ingressi
      const lat = +c[i.stop_lat], lng = +c[i.stop_lon];
      if (isFinite(lat) && isFinite(lng))
        fermate.push({ id: c[i.stop_id], lat, lng });
    });

  // stop_times in streaming — il file grosso
  const macina = macinaCorse(trips, M);
  await tabella('stop_times.txt',
    ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
    (c, i) => macina.riga(c[i.trip_id], orarioS(c[i.arrival_time]),
      orarioS(c[i.departure_time]), c[i.stop_id], +c[i.stop_sequence]));

  const grafo = costruisciGrafo(fermate, macina.corse, macina.salite, M);
  const distPerMeta = {};
  for (const m of TEMPI.METE)
    distPerMeta[m.slug] = tempiVersoMeta(grafo, fermate, m, M);
  const griglie = costruisciGriglia(fermate, distPerMeta, M);

  const st = macina.conta();
  return {
    meta: M.griglia,
    griglie,
    stats: { giorno: giorno.data, servizi: giorno.servizi.size,
      corseAttive: trips.size, fermate: fermate.length,
      righeStopTimes: st.righe, partenzeInFinestra: st.dentro,
      ...grafo.stats },
  };
}

// ── la porta HTTP ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  const via = await requireCronOrAdmin(req, res);
  if (!via) return;
  const q = req.query || {};
  const t0 = Date.now();
  try {
    let doc = null;
    try { doc = await fsGet(DOC); } catch (e) { /* primo giro */ }
    if (q.stato === '1') {
      return res.status(200).json({ ok: true, esiste: !!doc,
        generatedAt: doc && doc.generatedAt || null,
        stats: doc && doc.stats || null });
    }
    if (doc && doc.generatedAt && q.force !== '1') {
      const eta = Date.now() - new Date(doc.generatedAt).getTime();
      if (eta < FRESCO_MS) {
        return res.status(200).json({ ok: true, skipped: 'fresco',
          generatedAt: doc.generatedAt });
      }
    }

    const r = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'BOOM-Rome/1.0 (tempi vetrina; boomrome.com)' },
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) throw new Error('feed HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());

    const esito = await costruisciDaZip(buf, new Date());

    const payload = {
      generatedAt: new Date().toISOString(),
      feedUrl: FEED_URL,
      feedBytes: buf.length,
      feedLastModified: r.headers.get('last-modified') || null,
      meta: esito.meta,
      griglie: esito.griglie,
      stats: esito.stats,
      elapsedMs: Date.now() - t0,
    };
    if (q.dry === '1') {
      return res.status(200).json({ ok: true, dry: true,
        stats: esito.stats, elapsedMs: payload.elapsedMs });
    }
    await fsPatch(DOC, payload);
    await reportEmployeeHealth('pendolare', { ok: true, stats: {
      ...esito.stats, feedBytes: buf.length, elapsedMs: payload.elapsedMs } });
    return res.status(200).json({ ok: true, stats: esito.stats,
      elapsedMs: payload.elapsedMs });
  } catch (e) {
    await reportEmployeeHealth('pendolare', { ok: false, error: e.message })
      .catch(() => {});
    return res.status(500).json({ ok: false, error: e.message,
      elapsedMs: Date.now() - t0 });
  }
}
