#!/usr/bin/env node
// LA COSTA D'EUROPA per l'Orizzonte (v1.7, 03/11/2026): la mappa di
// /desks e della Rete di ogni pagina desk. Scritta UNA volta in
// cities/_europe.json, letta da build-cities.mjs: il build non scarica
// niente e regge senza il file (resta il globo, senza terra).
//
// Fonte: Natural Earth 1:50m land (dominio pubblico, naturalearthdata.com),
// la copia GeoJSON del repository nvkelso/natural-earth-vector.
//
// v1.7: la costa si salva in GRADI (lon, lat), non più proiettata. La
// proiezione è quella della camera dell'Orizzonte (build-cities.mjs,
// `hzCamera`), che si inquadra da sola sui desk: aggiungere un desk cambia
// l'inquadratura e la costa la segue al build, senza rigenerare questo
// file. Qui: ritaglio alla finestra che la camera può vedere (Sutherland–
// Hodgman in gradi), semplificazione Douglas–Peucker a 0,02° (≈ 2 km, sotto
// il mezzo punto dello schermo), anelli sotto 0,01 gradi² tolti (Malta
// resta), due decimali. La seconda semplificazione, in unità dello schermo,
// la fa il build dopo la proiezione.
//
// Uso:  node design/pages-deco/genera-europa.mjs [ne_50m_land.geojson]
// Senza argomento scarica il file da GitHub (raw). Nessun percorso di una
// casa qui dentro: la radice si deriva dal file (tests/radici).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clipRect, dpRing, ringArea } from '../../build-cities.mjs';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const RADICE = path.dirname(path.dirname(QUI));
const OUT = path.join(RADICE, 'cities', '_europe.json');
const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson';
const SOURCE = 'Natural Earth 1:50m land (public domain)';
// lon/lat window: everything the Horizon camera can show, with room (the
// build checks that the frame's corners and the horizon fall inside it)
export const WINDOW = [-45, 12, 70, 88];
const EPS = 0.02, MIN_AREA = 0.01, DECIMALS = 2;

const src = process.argv[2];
const text = src ? fs.readFileSync(src, 'utf8') : await (await fetch(URL)).text();
const gj = JSON.parse(text);
const rings = [];
for (const f of gj.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const poly of polys) for (const ring of poly) {
    const r = clipRect(ring.map(([lon, lat]) => [lon, lat]), WINDOW);
    if (r.length < 3) continue;
    const s = dpRing(r, EPS);
    if (s.length < 3 || Math.abs(ringArea(s)) < MIN_AREA) continue;
    const k = 10 ** DECIMALS;
    rings.push(s.flatMap(([lon, lat]) => [Math.round(lon * k) / k, Math.round(lat * k) / k]));
  }
}
const out = {
  source: SOURCE, url: URL, generated: new Date().toISOString().slice(0, 10),
  projection: 'none: degrees (lon, lat); build-cities.mjs projects them with the Horizon camera',
  window: WINDOW, simplify: { douglasPeucker: EPS, minRingArea: MIN_AREA, decimals: DECIMALS },
  rings
};
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`cities/_europe.json: ${rings.length} rings, ${rings.reduce((n, r) => n + r.length / 2, 0)} points, ${fs.statSync(OUT).size} bytes`);
