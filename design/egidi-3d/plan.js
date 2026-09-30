// L'appartamento tipo del centro storico: dati in metri, una copia sola.
// Origine = spigolo esterno nord-ovest del corpo di fabbrica.
// x -> est, z -> sud, y -> alto. Facciata su strada a sud (z = 9.40), corte a nord (z = 0).
export const H = 3.80;            // altezza netta interna (piano nobile)
export const EXT = { w: 12.00, d: 9.40 };
export const CUT = 1.10;          // quota del piano di sezione della planimetria

// Muri: [x0, z0, x1, z1, tipo]. tipo decide il conteggio della superficie (DPR 138/98).
export const WALLS = [
  [0.00, 0.00, 12.00, 0.55, 'perimetrale'], // 0 corte (nord); fra x 4,07 e 6,40 e' il muro verso il vano scala, col portone
  [0.00, 8.85, 12.00, 9.40, 'perimetrale'], // 1 strada (sud)
  [0.00, 0.55, 0.45, 8.85, 'confine'],      // 2 confine ovest
  [11.55, 0.55, 12.00, 8.85, 'confine'],    // 3 confine est, in comunione
  [0.45, 4.40, 11.55, 4.75, 'spina'],       // 4 muro di spina portante
  [6.20, 4.75, 6.32, 8.85, 'tramezzo'],     // 5 soggiorno | camera
  [3.95, 0.55, 4.07, 4.40, 'tramezzo'],     // 6 cucina | ingresso
  [6.40, 0.55, 6.52, 4.40, 'tramezzo'],     // 7 ingresso | bagno/disimpegno
  [6.52, 2.95, 8.60, 3.07, 'tramezzo'],     // 8 bagno | disimpegno
  [8.60, 0.55, 8.72, 4.40, 'tramezzo'],     // 9 disimpegno | cameretta
  [9.45, 4.75, 9.57, 6.97, 'tramezzo'],     // 10 bagno 2 ovest
  [9.57, 6.85, 11.55, 6.97, 'tramezzo'],    // 11 bagno 2 sud
];

// Aperture: wall = indice, c = centro lungo l'asse lungo del muro, w = luce, y0..y1 quote.
// k: finestra | portafinestra | porta | portone | doppia. hinge 0/1 = cardine all'estremo
// minore/maggiore; side +1/-1 = verso di apertura lungo la normale del muro (+z o +x).
export const OPENINGS = [
  { wall: 0, c: 1.80, w: 1.20, y0: 0.80, y1: 3.30, k: 'finestra' },            // cucina
  { wall: 0, c: 5.20, w: 1.00, y0: 0.00, y1: 2.50, k: 'portone', hinge: 0, side: 1 },
  { wall: 0, c: 7.40, w: 0.80, y0: 1.30, y1: 2.90, k: 'finestra' },            // bagno
  { wall: 0, c: 10.20, w: 1.20, y0: 0.80, y1: 3.30, k: 'finestra' },           // cameretta
  { wall: 1, c: 1.80, w: 1.20, y0: 0.00, y1: 3.30, k: 'portafinestra', parapetto: true }, // soggiorno
  { wall: 1, c: 4.60, w: 1.20, y0: 0.00, y1: 3.30, k: 'portafinestra', parapetto: true },
  { wall: 1, c: 7.40, w: 1.20, y0: 0.80, y1: 3.30, k: 'finestra' },            // camera
  { wall: 1, c: 10.20, w: 1.20, y0: 0.80, y1: 3.30, k: 'finestra' },
  { wall: 4, c: 5.10, w: 1.40, y0: 0.00, y1: 2.70, k: 'doppia', side: 1 },      // ingresso -> soggiorno, le ante si aprono nel soggiorno
  { wall: 4, c: 8.10, w: 0.90, y0: 0.00, y1: 2.40, k: 'porta', hinge: 1, side: 1 },
  { wall: 8, c: 7.56, w: 0.75, y0: 0.00, y1: 2.20, k: 'porta', hinge: 0, side: -1 },
  { wall: 6, c: 2.60, w: 0.90, y0: 0.00, y1: 2.40, k: 'porta', hinge: 0, side: 1 },
  { wall: 7, c: 3.735, w: 0.80, y0: 0.00, y1: 2.40, k: 'porta', hinge: 1, side: 1 },
  { wall: 9, c: 3.735, w: 0.80, y0: 0.00, y1: 2.40, k: 'porta', hinge: 1, side: 1 },
  { wall: 10, c: 6.20, w: 0.75, y0: 0.00, y1: 2.20, k: 'porta', hinge: 0, side: 1 },
];

// Stanze: rettangoli netti [x0, z0, x1, z1]; pav = pavimento.
export const ROOMS = [
  { id: 'soggiorno', nome: 'Soggiorno', pav: 'spina', rects: [[0.45, 4.75, 6.20, 8.85]] },
  { id: 'camera', nome: 'Camera', pav: 'spina', rects: [[6.32, 4.75, 9.45, 8.85], [9.45, 6.97, 11.55, 8.85]] },
  { id: 'bagno2', nome: 'Bagno 2', pav: 'marmo', rects: [[9.57, 4.75, 11.55, 6.85]] },
  { id: 'cucina', nome: 'Cucina', pav: 'cotto', rects: [[0.45, 0.55, 3.95, 4.40]] },
  { id: 'ingresso', nome: 'Ingresso', pav: 'spina', rects: [[4.07, 0.55, 6.40, 4.40]] },
  { id: 'bagno', nome: 'Bagno', pav: 'marmo', rects: [[6.52, 0.55, 8.60, 2.95]] },
  { id: 'disimpegno', nome: 'Disimpegno', pav: 'spina', rects: [[6.52, 3.07, 8.60, 4.40]] },
  { id: 'cameretta', nome: 'Cameretta', pav: 'spina', rects: [[8.72, 0.55, 11.55, 4.40]] },
];

// ── ARREDI ──────────────────────────────────────────────────────────────────────
// Primitive: t = box | rbox | cyl | sfera; s = [w, h, d] (cyl: [rTop, h, rBottom]; sfera: [rx, ry, rz]);
// p = [x, y0 (base), z]; m = famiglia di materiale (legno, tessile, lucido, pietra, metallo, specchio,
// decoro, vetro); c = colore; r = raggio dello spigolo (rbox); q = segmenti; rot = [rx, ry, rz] attorno
// al centro; uv = regione dell'atlante dei decori. Niente toni che tirino al rosso.
export const COL = {
  noce: '#5A4434', noceS: '#45352A', rovere: '#A38260', laccato: '#E9E5DD', bianco: '#F1EEE8', ceramica: '#F4F3EF',
  nero: '#1D1D1F', ottone: '#B08D57', acciaio: '#B8BABD', tessuto: '#8E8981', blu: '#3E4452', lino: '#E7E2D8', lino2: '#C9C0B1', tenda: '#D9D0C1',
  ardesia: '#56606C', tappeto: '#6E675F', tappeto2: '#8C8377', sabbia: '#B9AE9C', salvia: '#7F8A74', ocra: '#B59B6A',
  foglia: '#4E5C44', foglia2: '#617050', ghisa: '#E6E2DA', vaso: '#D9D4CA', travertino: '#D6CCB9', rivestimento: '#E4DCCB',
  zoccolo: '#3A3A3C', limone: '#D6C45E', acqua: '#BFCBD0', vetroNero: '#131315',
};
const C = COL, G = Math.PI / 180;
const box = (s, p, m, c, x = {}) => ({ t: 'box', s, p, m, c, ...x });
const rbx = (s, p, m, c, r = 0.02, x = {}) => ({ t: 'rbox', s, p, m, c, r, ...x });
const cyl = (rt, h, rb, p, m, c, x = {}) => ({ t: 'cyl', s: [rt, h, rb], p, m, c, ...x });
const sfe = (rx, ry, rz, p, m, c, x = {}) => ({ t: 'sfera', s: [rx, ry, rz], p, m, c, ...x });
function caso(seed) { let a = Math.floor(seed * 9973) >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

function gambe(cx, cz, w, d, h, c = C.nero, ins = 0.05, r = 0.014, m = 'metallo') {
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cyl(r, h, r, [cx + sx * (w / 2 - ins), 0, cz + sz * (d / 2 - ins)], m, c, { q: 6 }));
  return out;
}
// sedia: (dx, dz) = verso cui guarda chi siede; lo schienale e' inclinato di 8 gradi all'indietro
function sedia(x, z, dx, dz, c = C.noce) {
  const bx = x - dx * 0.2, bz = z - dz * 0.2, lungoX = dx !== 0, t = 8 * G;
  const rot = lungoX ? [0, 0, dx > 0 ? t : -t] : [dz > 0 ? -t : t, 0, 0];
  return [
    rbx([0.44, 0.045, 0.44], [x, 0.44, z], 'legno', c, 0.018, { q: 1 }),
    rbx(lungoX ? [0.035, 0.40, 0.42] : [0.42, 0.40, 0.035], [bx - dx * 0.02, 0.50, bz - dz * 0.02], 'legno', c, 0.012, { q: 1, rot }),
    ...gambe(x, z, 0.44, 0.44, 0.44, c, 0.035, 0.013, 'legno'),
  ];
}
// divano a tre posti: schienale a nord (zb), guarda a sud
function divano(cx, zb, w = 2.2, col = C.tessuto) {
  const d = 0.92, zc = zb + d / 2, out = [];
  out.push(rbx([w, 0.22, d], [cx, 0.10, zc], 'tessile', col, 0.04, { q: 1 }));
  out.push(rbx([w, 0.44, 0.20], [cx, 0.30, zb + 0.10], 'tessile', col, 0.05, { q: 1 }));
  for (const s of [-1, 1]) out.push(rbx([0.18, 0.30, d], [cx + s * (w / 2 - 0.09), 0.30, zc], 'tessile', col, 0.05, { q: 1 }));
  const n = 3, iw = (w - 0.36) / n;
  for (let i = 0; i < n; i++) {
    const x = cx - (w - 0.36) / 2 + iw * (i + 0.5);
    out.push(rbx([iw - 0.015, 0.14, 0.68], [x, 0.32, zb + 0.54], 'tessile', col, 0.05, { q: 2 }));
    out.push(rbx([iw - 0.02, 0.40, 0.17], [x, 0.43, zb + 0.30], 'tessile', col, 0.06, { q: 2, rot: [-10 * G, 0, 0] }));
  }
  out.push(rbx([0.42, 0.40, 0.12], [cx - w / 2 + 0.44, 0.47, zb + 0.46], 'tessile', C.ocra, 0.05, { q: 2, rot: [-14 * G, 0.25, 0.06] }));
  out.push(rbx([0.40, 0.38, 0.12], [cx + w / 2 - 0.44, 0.47, zb + 0.46], 'tessile', C.salvia, 0.05, { q: 2, rot: [-12 * G, -0.3, -0.05] }));
  out.push(...gambe(cx, zc, w, d, 0.10, C.nero, 0.08, 0.018));
  return out;
}
// poltrona: guarda a nord, schienale a sud
function poltrona(cx, cz, col = C.blu) {
  return [
    rbx([0.80, 0.22, 0.80], [cx, 0.12, cz], 'tessile', col, 0.04, { q: 1 }),
    rbx([0.80, 0.46, 0.18], [cx, 0.30, cz + 0.31], 'tessile', col, 0.05, { q: 1, rot: [8 * G, 0, 0] }),
    rbx([0.14, 0.26, 0.80], [cx - 0.33, 0.32, cz], 'tessile', col, 0.05, { q: 1 }),
    rbx([0.14, 0.26, 0.80], [cx + 0.33, 0.32, cz], 'tessile', col, 0.05, { q: 1 }),
    rbx([0.52, 0.13, 0.58], [cx, 0.34, cz - 0.05], 'tessile', col, 0.05, { q: 2 }),
    ...gambe(cx, cz, 0.80, 0.80, 0.12, C.noce, 0.06, 0.016, 'legno'),
  ];
}
// letto: xw = muro della testiera, dir = +1 se il letto va verso +x
function letto(xw, cz, L, W, dir, colBase = C.lino2) {
  const cx = xw + dir * (0.10 + L / 2), out = [];
  out.push(rbx([0.10, 1.05, W + 0.10], [xw + dir * 0.05, 0.08, cz], 'tessile', colBase, 0.03, { q: 1 }));
  out.push(rbx([L, 0.28, W], [cx, 0.08, cz], 'tessile', colBase, 0.03, { q: 1 }));
  out.push(rbx([L - 0.04, 0.20, W - 0.04], [cx, 0.36, cz], 'tessile', C.lino, 0.06, { q: 1 }));
  out.push(rbx([L * 0.64, 0.07, W + 0.03], [cx + dir * L * 0.18, 0.52, cz], 'tessile', '#E2DDD2', 0.035, { q: 1 }));
  out.push(rbx([0.50, 0.05, W + 0.07], [cx + dir * (L / 2 - 0.34), 0.565, cz], 'tessile', C.ardesia, 0.02, { q: 1 }));
  const nc = W > 1.3 ? 2 : 1, pw = nc === 2 ? 0.66 : 0.60;
  for (let i = 0; i < nc; i++) {
    const z = cz + (nc === 2 ? (i - 0.5) * 0.76 : 0);
    out.push(rbx([0.15, 0.50, pw], [xw + dir * 0.24, 0.52, z], 'tessile', C.lino, 0.06, { q: 2, rot: [0, 0, dir * 22 * G] }));   // cuscino appoggiato
    out.push(rbx([0.34, 0.11, pw - 0.06], [xw + dir * 0.50, 0.56, z], 'tessile', '#DCD5C8', 0.05, { q: 1 }));             // cuscino disteso
  }
  out.push(...gambe(cx, cz, L, W, 0.08, C.noceS, 0.08, 0.022, 'legno'));
  return out;
}
// armadi, madie, cassettiere: fronte = 'x+' | 'x-' | 'z+' | 'z-'; w lungo la parete, d profondita'
function mobile(cx, cz, w, d, h, fronte, ante, col, y0 = 0, opz = {}) {
  const lungoX = fronte[0] === 'z', sg = fronte[1] === '+' ? 1 : -1, out = [], mat = opz.mat || 'lucido';
  const dim = (a, b, c2) => (lungoX ? [a, b, c2] : [c2, b, a]);
  const pos = (u, y, v) => (lungoX ? [cx + u, y, cz + v] : [cx + v, y, cz + u]);
  out.push(box(dim(w, h, d - 0.02), pos(0, y0, -sg * 0.01), mat, col));
  const n = ante, aw = w / n, cassetti = opz.cassetti;
  for (let i = 0; i < n; i++) {
    const u = -w / 2 + aw * (i + 0.5);
    if (cassetti) {
      for (let k = 0; k < cassetti; k++) {
        const ch = (h - 0.02) / cassetti, y = y0 + 0.01 + k * ch;
        out.push(box(dim(aw - 0.008, ch - 0.008, 0.02), pos(u, y + 0.004, sg * (d / 2 - 0.01)), mat, col));
        out.push(box(dim(0.12, 0.012, 0.018), pos(u, y + ch * 0.5, sg * (d / 2 + 0.009)), 'metallo', opz.maniglia || C.ottone));
      }
    } else {
      out.push(box(dim(aw - 0.006, h - 0.012, 0.022), pos(u, y0 + 0.006, sg * (d / 2 - 0.009)), mat, col));
      const lato = n === 1 ? 1 : i % 2 ? -1 : 1, mh = Math.min(0.32, h * 0.3);
      out.push(box(dim(0.012, mh, 0.018), pos(u + lato * (aw / 2 - 0.05), y0 + (h > 1.4 ? 1.02 : h - mh - 0.06), sg * (d / 2 + 0.01)), 'metallo', opz.maniglia || C.ottone));
    }
  }
  return out;
}
// basi della cucina contro una parete: zoccolo scuro, ante da 60 con le fughe, top in travertino
function basi(a0, a1, muro, fronte) {
  const lungoX = fronte[0] === 'z', sg = fronte[1] === '+' ? 1 : -1, d = 0.60, out = [], L = a1 - a0, m = (a0 + a1) / 2;
  const P = (u, y, v) => (lungoX ? [u, y, muro + sg * v] : [muro + sg * v, y, u]);
  const D = (a, b, c2) => (lungoX ? [a, b, c2] : [c2, b, a]);
  out.push(box(D(L, 0.10, d - 0.07), P(m, 0, (d - 0.07) / 2), 'lucido', C.zoccolo));
  out.push(box(D(L, 0.74, d - 0.03), P(m, 0.10, (d - 0.03) / 2), 'lucido', C.laccato));
  const n = Math.max(1, Math.round(L / 0.6)), aw = L / n;
  for (let i = 0; i < n; i++) {
    const u = a0 + aw * (i + 0.5);
    out.push(box(D(aw - 0.006, 0.72, 0.02), P(u, 0.12, d - 0.02), 'lucido', C.laccato));
    out.push(box(D(0.28, 0.012, 0.02), P(u, 0.77, d + 0.005), 'metallo', C.acciaio));
  }
  out.push(box(D(L + 0.02, 0.04, d + 0.02), P(m, 0.86, (d + 0.02) / 2), 'pietra', C.travertino));
  return out;
}
function radiatore(x0, x1, zf, dz, y0 = 0.14, h = 0.60) {
  const out = [], n = Math.round((x1 - x0) / 0.085), zc = zf + dz * 0.07;
  for (let i = 0; i < n; i++) out.push(box([0.055, h, 0.085], [x0 + (i + 0.5) * (x1 - x0) / n, y0, zc], 'lucido', C.ghisa));
  out.push(box([x1 - x0, 0.03, 0.05], [(x0 + x1) / 2, y0 + 0.05, zc], 'lucido', C.ghisa));
  out.push(box([x1 - x0, 0.03, 0.05], [(x0 + x1) / 2, y0 + h - 0.08, zc], 'lucido', C.ghisa));
  return out;
}
// tende di lino ai lati di un'apertura in un muro est-ovest (zf = filo interno, dz = verso la stanza)
function tende(s0, s1, zf, dz, y1 = 3.50, y0 = 0.02) {
  const out = [], z = zf + dz * 0.12;
  for (const [a, b] of [[s0 - 0.40, s0 + 0.06], [s1 - 0.06, s1 + 0.40]]) out.push(box([b - a, y1 - y0, 0.05], [(a + b) / 2, y0, z], 'decoro', C.tenda, { uv: 'pieghe' }));
  const L = s1 - s0 + 1.1;
  out.push(cyl(0.012, L, 0.012, [(s0 + s1) / 2, y1 + 0.03 - L / 2, z + 0.01 * dz], 'metallo', C.nero, { q: 8, rot: [0, 0, 90 * G] }));
  return out;
}
function quadroX(x, dir, zc, y0, w, h, uv, cc = C.nero) {
  return [box([0.03, h, w], [x + dir * 0.015, y0, zc], 'legno', cc), box([0.01, h - 0.09, w - 0.09], [x + dir * 0.033, y0 + 0.045, zc], 'decoro', '#FFFFFF', { uv })];
}
function quadroZ(z, dir, xc, y0, w, h, uv, cc = C.nero) {
  return [box([w, h, 0.03], [xc, y0, z + dir * 0.015], 'legno', cc), box([w - 0.09, h - 0.09, 0.01], [xc, y0 + 0.045, z + dir * 0.033], 'decoro', '#FFFFFF', { uv })];
}
function pianta(x, z, h = 1.5, seed = 1) {
  const R = caso(seed), out = [cyl(0.17, 0.36, 0.13, [x, 0, z], 'lucido', C.vaso, { q: 16 }), cyl(0.012, h * 0.5, 0.016, [x, 0.34, z], 'legno', C.noceS, { q: 6 })];
  for (let i = 0; i < 7; i++) {
    const a = R() * 6.283, rr = 0.06 + R() * 0.16, y = 0.62 + (i / 6) * (h - 0.8), s = 0.17 + R() * 0.1;
    out.push(sfe(s, s * 0.8, s, [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr], 'tessile', i % 2 ? C.foglia : C.foglia2, { q: 1 }));
  }
  return out;
}
function lampadaTerra(x, z) {
  return [cyl(0.14, 0.02, 0.14, [x, 0, z], 'metallo', C.nero, { q: 16 }), cyl(0.011, 1.46, 0.011, [x, 0.02, z], 'metallo', C.ottone, { q: 8 }), cyl(0.15, 0.28, 0.19, [x, 1.40, z], 'tessile', C.lino, { q: 20 })];
}
function lampadaComodino(x, z, y) {
  return [cyl(0.065, 0.26, 0.075, [x, y, z], 'lucido', C.ceramica, { q: 14 }), cyl(0.11, 0.18, 0.14, [x, y + 0.24, z], 'tessile', C.lino, { q: 16 })];
}
function sospensione(x, z, y) {
  return [cyl(0.24, 0.025, 0.26, [x, 3.775, z], 'lucido', C.bianco, { q: 24 }), cyl(0.15, 0.02, 0.17, [x, 3.755, z], 'lucido', C.bianco, { q: 24 }),cyl(0.004, 3.80 - y - 0.17, 0.004, [x, y + 0.17, z], 'metallo', C.nero, { q: 4 }), cyl(0.03, 0.17, 0.20, [x, y, z], 'metallo', C.nero, { q: 20 }), cyl(0.18, 0.005, 0.18, [x, y - 0.001, z], 'lucido', '#FFF6E6', { q: 20 })];
}
function libri(x, y, z, w, h, d, lungoX = true) { return box(lungoX ? [w, h, d] : [d, h, w], [x, y, z], 'decoro', '#FFFFFF', { uv: 'libri' }); }

export const FURNITURE = {
  soggiorno: [
    box([2.70, 0.008, 2.00], [2.15, 0, 6.72], 'tessile', C.tappeto), box([2.40, 0.012, 1.70], [2.15, 0, 6.72], 'tessile', C.tappeto2),
    ...divano(2.15, 4.93),
    rbx([1.00, 0.045, 0.55], [2.15, 0.36, 6.55], 'legno', C.noce, 0.01, { q: 1 }), ...gambe(2.15, 6.55, 1.00, 0.55, 0.36, C.nero, 0.05, 0.013),
    libri(1.88, 0.405, 6.52, 0.28, 0.06, 0.21), cyl(0.11, 0.07, 0.07, [2.45, 0.405, 6.58], 'lucido', C.ceramica, { q: 16 }),
    ...mobile(0.69, 6.75, 2.00, 0.46, 0.64, 'x+', 4, C.noce, 0.12, { mat: 'legno' }), ...gambe(0.69, 6.75, 0.40, 1.90, 0.12, C.noceS, 0.04, 0.02, 'legno'),
    cyl(0.07, 0.30, 0.09, [0.70, 0.76, 6.05], 'lucido', C.vaso, { q: 14 }), libri(0.70, 0.76, 7.28, 0.62, 0.26, 0.20, false),
    ...quadroX(0.45, 1, 6.75, 1.30, 1.30, 0.95, 'quadro1'),
    ...quadroZ(4.75, 1, 2.15, 1.34, 1.60, 0.92, 'quadro2', C.noceS),
    ...lampadaTerra(3.62, 5.20),
    ...poltrona(3.55, 7.42),
    rbx([0.95, 0.045, 1.70], [5.25, 0.73, 6.85], 'legno', C.noce, 0.008, { q: 1 }),
    box([0.80, 0.08, 1.52], [5.25, 0.65, 6.85], 'legno', C.noceS),
    ...gambe(5.25, 6.85, 0.95, 1.70, 0.73, C.noce, 0.07, 0.028, 'legno'),
    ...sedia(4.56, 6.45, 1, 0), ...sedia(4.56, 7.25, 1, 0), ...sedia(5.94, 6.45, -1, 0), ...sedia(5.94, 7.25, -1, 0),
    cyl(0.17, 0.08, 0.10, [5.25, 0.775, 6.85], 'lucido', C.ceramica, { q: 20 }),
    ...sospensione(5.25, 6.85, 1.96),
    ...pianta(0.82, 8.20, 1.65, 3),
    ...radiatore(2.75, 3.62, 8.85, -1),
    ...tende(1.20, 2.40, 8.85, -1), ...tende(4.00, 5.20, 8.85, -1),
  ],
  ingresso: [
    ...mobile(4.37, 1.32, 1.40, 0.60, 2.40, 'x+', 2, C.laccato),
    rbx([0.35, 0.035, 1.10], [6.22, 0.78, 1.75], 'legno', C.noce, 0.006, { q: 1 }), box([0.32, 0.12, 1.04], [6.23, 0.66, 1.75], 'legno', C.noce),
    ...gambe(6.22, 1.75, 0.35, 1.10, 0.66, C.nero, 0.03, 0.011),
    box([0.03, 0.95, 0.75], [6.385, 1.12, 1.75], 'legno', C.noceS), box([0.01, 0.87, 0.67], [6.368, 1.16, 1.75], 'specchio', '#FFFFFF'),
    cyl(0.10, 0.06, 0.07, [6.22, 0.815, 1.50], 'lucido', C.ceramica, { q: 16 }), cyl(0.05, 0.26, 0.06, [6.22, 0.815, 2.05], 'lucido', C.vaso, { q: 12 }),
    box([1.00, 0.008, 2.40], [5.20, 0, 2.35], 'tessile', '#7A7266'), box([0.84, 0.011, 2.24], [5.20, 0, 2.35], 'tessile', C.sabbia),
    cyl(0.10, 0.52, 0.10, [4.32, 0, 3.98], 'metallo', C.nero, { q: 14 }),
    cyl(0.22, 0.06, 0.17, [5.20, 3.72, 2.40], 'lucido', C.bianco, { q: 24 }),
  ],
  cucina: [
    ...basi(0.45, 3.20, 0.55, 'z+'),
    ...basi(1.15, 3.35, 0.45, 'x+'),
    box([0.60, 2.40, 0.59], [3.50, 0, 0.85], 'lucido', C.laccato),
    box([0.594, 1.40, 0.02], [3.50, 0.10, 1.155], 'lucido', C.laccato), box([0.594, 0.86, 0.02], [3.50, 1.51, 1.155], 'lucido', C.laccato),
    box([0.012, 0.40, 0.02], [3.25, 1.00, 1.175], 'metallo', C.acciaio), box([0.012, 0.30, 0.02], [3.25, 1.56, 1.175], 'metallo', C.acciaio),
    box([0.70, 0.004, 0.42], [1.80, 0.901, 0.85], 'metallo', C.acciaio), box([0.62, 0.004, 0.34], [1.80, 0.903, 0.85], 'metallo', '#7E8286'),
    cyl(0.014, 0.30, 0.014, [1.80, 0.905, 0.62], 'metallo', C.acciaio, { q: 8 }), box([0.022, 0.022, 0.20], [1.80, 1.18, 0.71], 'metallo', C.acciaio),
    box([0.54, 0.006, 0.60], [0.76, 0.901, 2.45], 'lucido', C.vetroNero),
    box([0.02, 0.46, 0.56], [1.065, 0.30, 2.45], 'lucido', C.vetroNero),
    ...mobile(0.625, 2.25, 2.20, 0.35, 0.78, 'x+', 4, C.laccato, 1.50),
    box([0.75, 0.60, 0.012], [0.825, 0.90, 0.556], 'pietra', C.travertino), box([0.80, 0.60, 0.012], [2.80, 0.90, 0.556], 'pietra', C.travertino),
    box([0.012, 0.60, 2.20], [0.456, 0.90, 2.25], 'pietra', C.travertino),
    box([0.40, 0.02, 0.28], [2.75, 0.90, 0.86], 'legno', C.rovere),
    cyl(0.06, 0.18, 0.06, [0.72, 0.90, 1.40], 'lucido', C.ceramica, { q: 12 }), cyl(0.06, 0.13, 0.06, [0.72, 0.90, 1.58], 'lucido', C.ceramica, { q: 12 }),
    cyl(0.45, 0.035, 0.45, [2.20, 0.735, 3.10], 'legno', C.rovere, { q: 32 }), cyl(0.035, 0.705, 0.035, [2.20, 0.03, 3.10], 'metallo', C.nero, { q: 12 }),
    cyl(0.24, 0.03, 0.26, [2.20, 0, 3.10], 'metallo', C.nero, { q: 24 }),
    ...sedia(1.62, 3.10, 1, 0, C.rovere), ...sedia(2.78, 3.10, -1, 0, C.rovere),
    cyl(0.13, 0.06, 0.08, [2.20, 0.77, 3.10], 'lucido', C.ceramica, { q: 16 }),
    sfe(0.045, 0.04, 0.045, [2.16, 0.80, 3.08], 'lucido', C.limone, { q: 1 }), sfe(0.045, 0.04, 0.045, [2.25, 0.80, 3.13], 'lucido', C.limone, { q: 1 }), sfe(0.045, 0.04, 0.045, [2.21, 0.83, 3.04], 'lucido', C.limone, { q: 1 }),
    ...sospensione(2.20, 3.10, 1.92),
  ],
  disimpegno: [
    ...quadroX(6.52, 1, 3.735, 1.35, 0.50, 0.65, 'quadro3', C.noce),
  ],
  bagno: [
    box([1.70, 0.10, 0.75], [7.37, 0, 0.925], 'lucido', C.ceramica),
    box([1.70, 0.46, 0.08], [7.37, 0.10, 0.59], 'lucido', C.ceramica), box([1.70, 0.46, 0.08], [7.37, 0.10, 1.26], 'lucido', C.ceramica),
    box([0.08, 0.46, 0.59], [6.56, 0.10, 0.925], 'lucido', C.ceramica), box([0.08, 0.46, 0.59], [8.18, 0.10, 0.925], 'lucido', C.ceramica),
    box([1.54, 0.01, 0.59], [7.37, 0.42, 0.925], 'lucido', C.acqua),
    rbx([0.56, 0.40, 0.38], [8.32, 0, 2.05], 'lucido', C.ceramica, 0.08, { q: 1 }), box([0.16, 0.40, 0.40], [8.52, 0.40, 2.05], 'lucido', C.ceramica),
    box([0.46, 0.40, 0.70], [6.75, 0.42, 2.30], 'legno', C.noce), box([0.48, 0.04, 0.72], [6.76, 0.82, 2.30], 'pietra', C.travertino),
    rbx([0.36, 0.12, 0.44], [6.78, 0.86, 2.30], 'lucido', C.ceramica, 0.04, { q: 1 }), cyl(0.012, 0.20, 0.012, [6.59, 0.86, 2.30], 'metallo', C.acciaio, { q: 8 }),
    box([0.012, 0.80, 0.60], [6.528, 1.12, 2.30], 'specchio', '#FFFFFF'),
    box([2.08, 1.20, 0.012], [7.56, 0, 0.556], 'pietra', C.rivestimento), box([0.012, 1.20, 2.40], [6.526, 0, 1.75], 'pietra', C.rivestimento),
    box([0.012, 1.20, 2.40], [8.594, 0, 1.75], 'pietra', C.rivestimento),
    box([0.665, 1.20, 0.012], [6.8525, 0, 2.944], 'pietra', C.rivestimento), box([0.665, 1.20, 0.012], [8.2675, 0, 2.944], 'pietra', C.rivestimento),
  ],
  cameretta: [
    box([1.50, 0.01, 1.10], [10.05, 0, 2.15], 'tessile', '#9A9F92'),
    ...letto(11.55, 3.40, 1.95, 1.22, -1, C.salvia),
    rbx([1.20, 0.035, 0.60], [10.20, 0.72, 0.86], 'legno', C.rovere, 0.006, { q: 1 }), ...gambe(10.20, 0.86, 1.20, 0.60, 0.72, C.nero, 0.04, 0.013),
    ...sedia(10.20, 1.42, 0, -1, C.rovere),
    cyl(0.07, 0.02, 0.07, [10.62, 0.755, 0.72], 'metallo', C.nero, { q: 12 }), cyl(0.008, 0.40, 0.008, [10.62, 0.775, 0.72], 'metallo', C.nero, { q: 6 }),
    cyl(0.03, 0.12, 0.08, [10.62, 1.10, 0.76], 'metallo', C.nero, { q: 12 }),
    libri(9.85, 0.755, 0.72, 0.36, 0.24, 0.18),
    ...mobile(9.02, 1.50, 1.60, 0.60, 2.40, 'x+', 2, C.laccato),
    box([0.25, 0.025, 1.00], [11.42, 1.55, 3.40], 'legno', C.rovere), libri(11.43, 1.575, 3.40, 0.80, 0.24, 0.18, false),
    ...tende(9.60, 10.80, 0.55, 1, 3.50, 0.85),
  ],
  camera: [
    box([2.50, 0.01, 2.40], [7.60, 0, 7.05], 'tessile', C.sabbia),
    ...letto(6.32, 7.05, 2.05, 1.75, 1),
    ...mobile(6.52, 5.90, 0.42, 0.40, 0.48, 'x+', 1, C.noce, 0, { mat: 'legno', cassetti: 2 }),
    ...mobile(6.52, 8.22, 0.42, 0.40, 0.48, 'x+', 1, C.noce, 0, { mat: 'legno', cassetti: 2 }),
    ...lampadaComodino(6.52, 5.90, 0.48), ...lampadaComodino(6.52, 8.22, 0.48),
    ...quadroX(6.32, 1, 7.05, 1.28, 1.10, 0.75, 'quadro3', C.noce),
    ...mobile(9.05, 5.05, 0.80, 0.60, 2.40, 'z+', 2, C.laccato),
    ...mobile(10.55, 8.625, 1.20, 0.45, 0.75, 'z-', 2, C.noce, 0, { mat: 'legno', cassetti: 3 }),
    cyl(0.06, 0.34, 0.08, [10.20, 0.75, 8.66], 'lucido', C.vaso, { q: 12 }), libri(10.85, 0.75, 8.66, 0.30, 0.06, 0.22),
    ...radiatore(6.95, 7.85, 8.85, -1, 0.14, 0.56),
    ...tende(6.80, 8.00, 8.85, -1), ...tende(9.60, 10.80, 8.85, -1, 3.50, 0.85),
    ...poltrona(9.00, 8.08, C.salvia),
    ...pianta(11.18, 7.38, 1.35, 7),
  ],
  bagno2: [
    box([0.90, 0.04, 0.90], [11.10, 0, 5.20], 'lucido', C.ceramica),
    box([0.90, 2.00, 0.008], [11.10, 0.04, 5.65], 'vetro', '#FFFFFF'),
    cyl(0.10, 0.015, 0.10, [11.10, 2.05, 5.00], 'metallo', C.acciaio, { q: 16 }), box([0.02, 0.02, 0.26], [11.10, 2.07, 4.88], 'metallo', C.acciaio),
    box([0.012, 2.10, 0.90], [11.544, 0, 5.20], 'pietra', C.rivestimento), box([0.90, 2.10, 0.012], [11.10, 0, 4.756], 'pietra', C.rivestimento),
    rbx([0.38, 0.40, 0.56], [10.05, 0.02, 5.03], 'lucido', C.ceramica, 0.08, { q: 1 }), box([0.40, 0.40, 0.16], [10.05, 0.42, 4.83], 'lucido', C.ceramica),
    box([0.46, 0.40, 0.70], [11.32, 0.42, 6.35], 'legno', C.noce), box([0.48, 0.04, 0.72], [11.31, 0.82, 6.35], 'pietra', C.travertino),
    rbx([0.36, 0.12, 0.44], [11.29, 0.86, 6.35], 'lucido', C.ceramica, 0.04, { q: 1 }), cyl(0.012, 0.20, 0.012, [11.48, 0.86, 6.35], 'metallo', C.acciaio, { q: 8 }),
    box([0.012, 0.80, 0.60], [11.544, 1.12, 6.35], 'specchio', '#FFFFFF'),
  ],
};

// Superfici: netta per stanza e commerciale (DPR 138/98, all. C): muri perimetrali per intero
// fino a 50 cm, muri in comunione al 50% fino a 25 cm. Il tratto nord fra x 4,07 e 6,40 da'
// sul vano scala (parte comune): si conta come muro in comunione, 25 cm e non 50.
export const SCALA = { x0: 4.07, x1: 6.40 };
export function superfici() {
  // in centimetri interi: niente residui di virgola mobile nelle superfici stampate (23,575 resta 23,575)
  const cm = (v) => Math.round(v * 100);
  const stanze = ROOMS.map((r) => ({ id: r.id, nome: r.nome, mq: r.rects.reduce((a, [x0, z0, x1, z1]) => a + cm(x1 - x0) * cm(z1 - z0), 0) / 10000 }));
  const netta = stanze.reduce((a, s) => a + s.mq, 0);
  const perim = Math.min(0.55, 0.50), comun = Math.min(0.45 / 2, 0.25);
  const lx = EXT.w - 2 * 0.45 + 2 * comun, lz = EXT.d - 2 * 0.55 + 2 * perim;
  const lorda = lx * lz - (SCALA.x1 - SCALA.x0) * (perim - 0.25);
  return { stanze, netta, lorda, commerciale: Math.round(lorda) };
}
