// tests/mappa/run.mjs
// LA MAPPA — il giudizio si prova senza browser e senza tile.
//
// Le regole nascono da difetti veri: TRE elenchi di mete mantenuti a mano
// (skyline, scheda annuncio, motore dei tempi) gia' divergenti — la scheda
// non conosceva LUMSA — e DUE mappe con la stessa libreria, lo stesso
// stile e gli stessi palazzi 3D. Un motore solo, e un test che lo tiene
// tale.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
const req = createRequire(import.meta.url);
const M = req(path.join(R, 'js/mappa-engine.js'));
const T = req(path.join(R, 'js/tempi-engine.js'));

let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (c, t) => c ? bene(t) : male(t);

console.log('\n\x1b[1m▸ mappa\x1b[0m  un motore, due facce');

// ── 1 · le mete sono UNA lista, e combacia con la griglia dei tempi ────
{
  const a = M.METE.map((m) => m.slug).sort();
  const b = T.METE.map((m) => m.slug).sort();
  check(JSON.stringify(a) === JSON.stringify(b),
    `le mete della mappa e quelle della griglia combaciano (${a.length})`);
  const senzaCoord = M.METE.filter((m) => !isFinite(m.lat) || !isFinite(m.lng));
  check(!senzaCoord.length, 'ogni meta ha coordinate vere');
  // le coordinate devono essere le STESSE, non solo gli slug: due punti
  // diversi per «Termini» darebbero due tempi diversi per lo stesso posto
  const scostate = M.METE.filter((m) => {
    const t = T.METE.find((x) => x.slug === m.slug);
    return !t || Math.abs(t.lat - m.lat) > 1e-6 || Math.abs(t.lng - m.lng) > 1e-6;
  });
  check(!scostate.length,
    'le coordinate combaciano fra i due motori' + (scostate.length
      ? ` — scostate: ${scostate.map((m) => m.slug).join(', ')}` : ''));
}

// ── 2 · NESSUN NUMERO SENZA IL SUO GRADO DI VERITA' ────────────────────
{
  const vicino = M.tempo(1.2);
  check(vicino.fonte === 'piedi' && /walk/.test(vicino.testo),
    'sotto i 2,6 km si cammina, e lo dice');
  const stimato = M.tempo(7.4);
  check(stimato.fonte === 'stima' && stimato.testo.startsWith('≈'),
    'senza griglia il numero e una STIMA e porta la ≈');
  const misurato = M.tempo(7.4, 26);
  check(misurato.fonte === 'rete' && misurato.min === 26 && !misurato.testo.includes('≈'),
    'con la griglia il numero e misurato e NON porta la ≈');
  // la mutazione che conta: un tempo misurato non deve mai essere marcato stima
  check(M.tempo(12, 31).fonte === 'rete' && M.tempo(12).fonte === 'stima',
    'lo stesso punto cambia GRADO, non solo numero, quando arriva la griglia');
  check(M.tempo(NaN) === null && M.tempo(-1) === null,
    'un dato impossibile non produce un numero');
}

// ── 3 · le vicine si ordinano per TEMPO, non per linea d'aria ──────────
{
  // Roma e' anisotropa: la meta piu' vicina in km non e' quella che si
  // raggiunge prima. Ordinare per km e' il difetto silenzioso.
  const eta = (slug) => (slug === 'luiss' ? 8 : slug === 'sapienza' ? 40 : null);
  const v = M.vicine(41.86, 12.52, { leggiEta: eta, quante: 9 });
  const iL = v.findIndex((x) => x.meta.slug === 'luiss');
  const iS = v.findIndex((x) => x.meta.slug === 'sapienza');
  const kmL = v[iL].km, kmS = v[iS].km;
  check(kmL > kmS && iL < iS,
    'LUISS e piu LONTANA di Sapienza ma si raggiunge prima: viene prima');
}

// ── 4 · i posti dell'utente: una chiave per tutto il sito ──────────────
{
  const finto = (() => { const m = {}; return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; })();
  check(M.CHIAVE === 'boom:pois',
    'la chiave e quella che le pagine usano gia (nessuna migrazione)');
  M.salvaPosto({ name: 'Sapienza', lat: 41.9, lng: 12.51 }, finto);
  M.salvaPosto({ name: 'Ufficio', lat: 41.88, lng: 12.47 }, finto);
  M.salvaPosto({ name: 'sapienza', lat: 41.91, lng: 12.52 }, finto);
  const p = M.posti(finto);
  check(p.length === 2, 'lo stesso nome si AGGIORNA, non si duplica');
  check(p[0].name === 'sapienza' && p[0].lat === 41.91,
    'il posto aggiornato torna in cima col dato nuovo');
  for (let i = 0; i < 8; i++) M.salvaPosto({ name: 'P' + i, lat: 41.9, lng: 12.5 }, finto);
  check(M.posti(finto).length === M.MAX_POSTI,
    `mai piu di ${M.MAX_POSTI} posti (l'elenco resta leggibile)`);
  M.salvaPosto({ name: 'Rotto', lat: NaN, lng: 12.5 }, finto);
  check(!M.posti(finto).some((x) => x.name === 'Rotto'),
    'un posto senza coordinate valide non entra');
  // Safari privato LANCIA su localStorage: non deve portarsi via la pagina
  const esplosivo = { getItem() { throw new Error('denied'); },
                      setItem() { throw new Error('denied'); } };
  let sopravvive = true;
  try { M.posti(esplosivo); M.salvaPosto({ name: 'X', lat: 41, lng: 12 }, esplosivo); }
  catch (e) { sopravvive = false; }
  check(sopravvive, 'un magazzino che lancia (Safari privato) non rompe niente');
}

// ── 5 · IL FILTRO PER MINUTI non promette cio' che non misura ──────────
{
  const case_ = [
    { id: 'a', lat: 41.9040, lng: 12.5130 },   // accanto a Sapienza
    { id: 'b', lat: 41.8000, lng: 12.4000 },   // lontana, misurata
    { id: 'c', lat: 41.8100, lng: 12.4100 },   // lontana, NON misurata
  ];
  const eta = (c) => (c.id === 'b' ? 22 : null);
  const r = M.filtroTempo(case_, 'sapienza', 25, eta);
  check(r.dentro.some((x) => x.id === 'a'), 'la casa a due passi entra');
  check(r.dentro.some((x) => x.id === 'b'), 'la casa misurata a 22′ entra in ≤25′');
  check(r.incerte.some((x) => x.id === 'c') && !r.dentro.some((x) => x.id === 'c'),
    'la casa con tempo STIMATO non entra: resta fra le incerte, dichiarata');
  const stretto = M.filtroTempo(case_, 'sapienza', 10, eta);
  check(stretto.fuori.some((x) => x.id === 'b'),
    'a ≤10′ la casa da 22′ esce');
  check(M.filtroTempo(case_, 'inesistente', 20, eta).dentro.length === 3,
    'una meta che non esiste non filtra niente invece di svuotare la mappa');
}

// ── 6 · le pagine leggono il motore, non una copia ─────────────────────
{
  const pagine = ['skyline.html', 'apartment-detail.html'];
  const senza = pagine.filter((f) => {
    const s = fs.readFileSync(path.join(R, f), 'utf8');
    return !s.includes('mappa-engine.js');
  });
  check(!senza.length,
    'skyline e la scheda caricano il motore condiviso'
    + (senza.length ? ` — manca in: ${senza.join(', ')}` : ''));
  // la formula della stima non deve ricomparire scritta a mano
  const copie = pagine.filter((f) => {
    const s = fs.readFileSync(path.join(R, f), 'utf8');
    return /\*\s*4\.2\s*\+\s*10/.test(s);
  });
  check(!copie.length,
    'la formula della stima vive in UN posto'
    + (copie.length ? ` — ricopiata in: ${copie.join(', ')}` : ''));
}

console.log(ko ? `  \x1b[31mLa mappa non e ancora una sola\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mUn motore, due facce\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
