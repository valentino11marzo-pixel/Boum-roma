// design/owners/pianta.mjs — LA PIANTA CHE SI ALZA, costruita dalla sua sorgente.
//
// Legge SOLO design/owners/pianta.json (centimetri) e scrive il markup della
// pianta: piatta (<symbol id="pp">), quote (<symbol id="pq">), la pianta
// ALZATA già proiettata con la stessa matrice che il CSS applica alla piatta,
// le etichette nei due stati, i ritagli, la pianta accesa e il palazzo.
// Puro e deterministico: stesso JSON, stessi byte. Niente rete, niente date.
//
// La matrice è rotateX(56deg) rotateZ(-38deg) scale(s) SENZA perspective:
// proiezione ortografica = mappa affine. Per questo la build può ricalcolare
// esattamente dove il browser porterà ogni punto della piatta, e alla fine
// della rotazione la pianta alzata (vettoriale) le si sovrappone al pixel.
// Tutte e due le svg hanno lo STESSO viewBox e lo stesso riquadro; il
// transform-origin del CSS è il centro del riquadro = il centro del viewBox.
import { readFileSync } from 'node:fs';

const J = JSON.parse(readFileSync(new URL('./pianta.json', import.meta.url), 'utf8'));
const RAD = Math.PI / 180;
const AL = J.alzata;
const ca = Math.cos(AL.rotateZ * RAD), sa = Math.sin(AL.rotateZ * RAD);
const cb = Math.cos(AL.rotateX * RAD), sb = Math.sin(AL.rotateX * RAD);
const H = AL.taglio; // i muri si tagliano a 120 cm

// ---------------------------------------------------------------- numeri
const f1 = (n) => { const v = Math.round(n * 10) / 10; return (Object.is(v, -0) ? 0 : v).toString(); };
const f0 = (n) => { const v = Math.round(n); return (Object.is(v, -0) ? 0 : v).toString(); };
// Un poligono in comandi relativi: si arrotondano i punti ASSOLUTI e poi si
// fanno le differenze, così l'arrotondamento non si accumula lungo il giro.
function pathRel(pts, close = true, fmt = f1) {
  const r = pts.map(([x, y]) => [+fmt(x), +fmt(y)]);
  let d = `M${r[0][0]} ${r[0][1]}`;
  for (let i = 1; i < r.length; i++) {
    const dx = +(r[i][0] - r[i - 1][0]).toFixed(1), dy = +(r[i][1] - r[i - 1][1]).toFixed(1);
    if (dy === 0) d += `h${dx}`; else if (dx === 0) d += `v${dy}`; else d += `l${dx} ${dy}`;
  }
  return close ? d + 'z' : d;
}
const rectPts = ([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const rectD = (r) => pathRel(rectPts(r), true, f0);
// Ellisse/cerchio come due archi (compatto, esatto).
const ellD = (cx, cy, rx, ry) => `M${f1(cx - rx)} ${f1(cy)}a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(2 * rx)} 0a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(-2 * rx)} 0z`;

// ------------------------------------------------------ unione dei muri
// Muri = rettangoli allineati agli assi; vani = rettangoli da togliere. Si fa
// una griglia sulle coordinate, si segnano le celle piene, si estraggono i
// bordi (ognuno con la sua normale uscente) e si concatenano in anelli.
function unione(rects, holes) {
  const xs = [...new Set(rects.concat(holes).flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.concat(holes).flatMap((r) => [r[1], r[3]]))].sort((a, b) => a - b);
  const inR = (r, x, y) => x > r[0] && x < r[2] && y > r[1] && y < r[3];
  const full = (i, j) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false;
    const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2;
    return rects.some((r) => inR(r, x, y)) && !holes.some((r) => inR(r, x, y));
  };
  const edges = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    if (!full(i, j)) continue;
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
    // verso di percorrenza t = (-ny, nx): pieno a destra (asse y in giù)
    if (!full(i, j - 1)) edges.push({ a: [x0, y0], b: [x1, y0], n: [0, -1] });
    if (!full(i + 1, j)) edges.push({ a: [x1, y0], b: [x1, y1], n: [1, 0] });
    if (!full(i, j + 1)) edges.push({ a: [x1, y1], b: [x0, y1], n: [0, 1] });
    if (!full(i - 1, j)) edges.push({ a: [x0, y1], b: [x0, y0], n: [-1, 0] });
  }
  // anelli
  const key = (p) => p[0] + ',' + p[1];
  const out = new Map();
  edges.forEach((e) => { const k = key(e.a); (out.get(k) || out.set(k, []).get(k)).push(e); });
  const used = new Set(), loops = [];
  for (const e0 of edges) {
    if (used.has(e0)) continue;
    const loop = [];
    let e = e0;
    while (e && !used.has(e)) {
      used.add(e); loop.push(e);
      const nx = (out.get(key(e.b)) || []).filter((q) => !used.has(q));
      e = nx[0]; // a un vertice doppio (scacchiera) va bene qualunque: evenodd
    }
    // punti, togliendo i vertici dove la direzione non cambia
    const pts = [];
    loop.forEach((q, i) => {
      const p = loop[(i + loop.length - 1) % loop.length];
      if (p.n[0] !== q.n[0] || p.n[1] !== q.n[1]) pts.push(q.a);
    });
    loops.push(pts);
  }
  // facce: segmenti massimali per (normale, retta)
  const groups = new Map();
  for (const e of edges) {
    const horiz = e.n[0] === 0;
    const k = e.n.join() + '|' + (horiz ? e.a[1] : e.a[0]);
    const lo = horiz ? Math.min(e.a[0], e.b[0]) : Math.min(e.a[1], e.b[1]);
    const hi = horiz ? Math.max(e.a[0], e.b[0]) : Math.max(e.a[1], e.b[1]);
    (groups.get(k) || groups.set(k, []).get(k)).push([lo, hi]);
  }
  const faces = [];
  for (const [k, iv] of groups) {
    const [nn, c] = k.split('|'); const n = nn.split(',').map(Number); const cc = +c;
    iv.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const s of iv) { const l = merged[merged.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else merged.push([...s]); }
    for (const [lo, hi] of merged) {
      faces.push(n[0] === 0 ? { a: [lo, cc], b: [hi, cc], n } : { a: [cc, lo], b: [cc, hi], n });
    }
  }
  return { loops, faces };
}
const loopsD = (loops, map = (p) => p, fmt = f0) => loops.map((l) => pathRel(l.map(map), true, fmt)).join('');

// --------------------------------------------------------- geometria base
const porte = J.porte, fin = J.finestre;
const muriCasa = J.muri.filter((r) => r[1] < J.esterno[3] + 1);      // la casa
const muriPiede = J.muri.filter((r) => r[1] >= J.esterno[3] + 1);     // il portone, al piede
const vaniPorte = porte.map((p) => p.vano);
const vaniFin = fin.map((w) => w.vano);
const casaPiatta = unione(muriCasa, vaniPorte.concat(vaniFin).filter((v) => v[1] < J.esterno[3] + 1));
const piedePiatto = unione(muriPiede, vaniPorte.filter((v) => v[1] >= J.esterno[3] + 1));
// in 3D una finestra col davanzale sopra il taglio non è un vano: muro pieno
const finTaglio = fin.filter((w) => w.davanzale < H);
const casa3d = unione(muriCasa, vaniPorte.concat(finTaglio.map((w) => w.vano)).filter((v) => v[1] < J.esterno[3] + 1));
const piede3d = piedePiatto;

// ------------------------------------------------ il disegno piatto (#pp)
const S = J.simboli;
function simboliD() {
  let d = '';
  const L = S.letto; d += rectD(L.r) + L.cuscini.map(rectD).join('') + `M${L.r[0]} ${L.piega}H${L.r[2]}`;
  const W = S.scrivania; d += rectD(W.r) + rectD(W.sedia) + `M${W.sedia[0]} ${W.sedia[3] - 8}H${W.sedia[2]}`;
  const D = S.divano; d += rectD(D.r) + `M${D.schienale} ${D.braccioli[0]}V${D.braccioli[1]}M${D.r[0]} ${D.braccioli[0]}H${D.r[2]}M${D.r[0]} ${D.braccioli[1]}H${D.r[2]}`;
  d += rectD(S.tavolo.r);
  d += ellD(S.tavoloCucina.c[0], S.tavoloCucina.c[1], S.tavoloCucina.raggio, S.tavoloCucina.raggio);
  d += rectD(S.piano.r) + rectD(S.lavello.r) + rectD(S.lavello.vasca) + rectD(S.cottura.r);
  d += S.cottura.fuochi.map(([x, y]) => ellD(x, y, S.cottura.raggio, S.cottura.raggio)).join('');
  const Dc = S.doccia.r; d += rectD(Dc) + `M${Dc[0]} ${Dc[1]}L${Dc[2]} ${Dc[3]}M${Dc[2]} ${Dc[1]}L${Dc[0]} ${Dc[3]}`;
  d += rectD(S.wc.cassetta) + ellD(...S.wc.tazza) + ellD(...S.bidet.tazza);
  d += rectD(S.lavabo.r) + ellD(...S.lavabo.vasca);
  const A = S.armadio.r; d += rectD(A) + `M${A[0]} ${A[1]}L${A[2]} ${A[3]}M${A[2]} ${A[1]}L${A[0]} ${A[3]}`;
  d += rectD(S.caldaia.r) + ellD(S.caldaia.c[0], S.caldaia.c[1], S.caldaia.raggio, S.caldaia.raggio);
  d += rectD(S.lavatrice.r) + ellD(S.lavatrice.c[0], S.lavatrice.c[1], S.lavatrice.raggio, S.lavatrice.raggio);
  const R = S.ringhiera; d += pathRel(R, false, f0) + pathRel(R.map(([x, y]) => [x === 1020 ? x : x - 5, y === 540 ? y + 5 : y === 800 ? y - 5 : y]), false, f0);
  const C = S.cassetta; d += rectD(C.r) + C.divisioni.map((x) => `M${x} ${C.r[1]}V${C.r[3]}`).join('');
  return d;
}
// porte: anta + arco di apertura (l'arco più leggero, come sul tecnigrafo)
function porteD() {
  let ante = '', archi = '';
  for (const p of porte) {
    if (p.arco) continue;
    const [hx, hy] = p.cardine, [bx, by] = p.battuta;
    const w = Math.hypot(bx - hx, by - hy);
    const tx = hx + p.verso[0] * w, ty = hy + p.verso[1] * w;
    ante += `M${hx} ${hy}L${f0(tx)} ${f0(ty)}`;
    const vx = tx - hx, vy = ty - hy, wx = bx - hx, wy = by - hy;
    const sweep = vx * wy - vy * wx > 0 ? 1 : 0;
    archi += `M${f0(tx)} ${f0(ty)}A${f0(w)} ${f0(w)} 0 0 ${sweep} ${bx} ${by}`;
  }
  return { ante, archi };
}
// finestre: doppia linea nello spessore del muro
function finestreD() {
  let d = '';
  for (const w of fin) {
    const [x0, y0, x1, y1] = w.vano;
    if (x1 - x0 > y1 - y0) { const t = y1 - y0; d += `M${x0} ${f0(y0 + t * 0.4)}H${x1}M${x0} ${f0(y0 + t * 0.6)}H${x1}`; }
    else { const t = x1 - x0; d += `M${f0(x0 + t * 0.4)} ${y0}V${y1}M${f0(x0 + t * 0.6)} ${y0}V${y1}`; }
  }
  return d;
}
const bandieraPiattaD = ([x, y]) => ({ asta: `M${x} ${y}v-58`, drappo: `M${x} ${y - 58}h32v18h-32z` });
const VE = 'vector-effect="non-scaling-stroke"';
function simboloPP() {
  const { ante, archi } = porteD();
  const stanze = J.stanze.map((s) => `<path d="${pathRel(s.poli, true, f0)}" style="fill:var(--r-${s.luce},none)"/>`).join('');
  const band = J.bandiere.map((b) => {
    const g = bandieraPiattaD(b.piede);
    return `<path d="${g.drappo}" style="fill:var(--f-${b.id},#8a877e)"/><path d="${g.asta}" stroke="#8a877e" fill="none" ${VE}/>`;
  }).join('');
  const piede = `<g style="display:var(--pp-pt,inline)"><use href="#ppf" fill="currentColor" stroke="none" mask="url(#ppm)"/><path id="ppf" d="${loopsD(piedePiatto.loops)}" ${VE}/></g>`;
  return `<symbol id="pp" viewBox="${VB.join(' ')}">` +
    `<g stroke="none">${stanze}</g>` +
    `<g fill="none" stroke="currentColor" stroke-width=".75">` +
    `<path d="${simboliD()}" stroke-opacity=".72" ${VE}/>` +
    `<path d="${archi}" stroke-opacity=".5" ${VE}/>` +
    `<path d="${ante}${finestreD()}" ${VE}/>` +
    `<use href="#ppw" fill="currentColor" stroke="none" mask="url(#ppm)"/>` +
    `<path id="ppw" d="${loopsD(casaPiatta.loops)}" ${VE}/>` +
    piede + `</g>` +
    `<g style="display:var(--pp-fd,inline)">${band}</g>` +
    `</symbol>`;
}

// quote, nord, scala grafica (#pq): solo sulla piatta, mai proiettate
function simboloPQ() {
  const Q = J.quote, k = Q.corpo;
  const o = Q.orizzontale, v = Q.verticale;
  const tick = (x, y) => `M${x - 9} ${y + 9}l18 -18`;
  let d = `M${o.da} ${o.y}H${o.a}` + tick(o.da, o.y) + tick(o.a, o.y) + `M${o.da} -18V${o.y - 14}M${o.a} -18V${o.y - 14}`;
  d += `M${v.x} ${v.da}V${v.a}` + tick(v.x, v.da) + tick(v.x, v.a) + `M-18 ${v.da}H${v.x - 14}M-18 ${v.a}H${v.x - 14}`;
  const N = J.nord, [nx, ny] = N.c, r = N.r;
  const sc = J.scala; const t = sc.tacche; const y0 = sc.y, h = sc.h;
  let pieni = '', vuoti = '';
  for (let i = 0; i < t.length - 1; i++) {
    const seg = rectD([sc.x + t[i], y0, sc.x + t[i + 1], y0 + h]);
    if (i % 2 === 0) pieni += seg; else vuoti += seg;
  }
  const txt = (x, y, s, extra = '') => `<text x="${x}" y="${y}"${extra}>${s}</text>`;
  const scTxt = t.map((x, i) => txt(sc.x + x, y0 + h + k + 6, sc.etichette[i], ' text-anchor="middle"')).join('');
  return `<symbol id="pq" viewBox="${VB.join(' ')}">` +
    `<g fill="none" stroke="currentColor" stroke-width=".75" stroke-opacity=".62">` +
    `<path d="${d}${vuoti}" ${VE}/>` +
    `<g transform="rotate(${N.angolo} ${nx} ${ny})"><path d="${ellD(nx, ny, r, r)}M${nx} ${ny + r * 0.7}V${ny - r * 1.25}" ${VE}/>` +
    `<path d="M${nx} ${ny - r * 1.25}l-9 22h18z" fill="currentColor" stroke="none"/>` +
    `<text x="${nx}" y="${ny - r * 1.5}" text-anchor="middle" fill="currentColor" stroke="none" font-size="${k}">N</text></g>` +
    `</g>` +
    `<path d="${pieni}" fill="currentColor" fill-opacity=".62"/>` +
    `<g fill="currentColor" fill-opacity=".8" font-size="${k}" font-family="ui-monospace,SF Mono,Menlo,Consolas,monospace" letter-spacing="1">` +
    txt((o.da + o.a) / 2, o.y - 14, o.testo, ' text-anchor="middle"') +
    txt(v.x - 14, (v.da + v.a) / 2, v.testo, ` text-anchor="middle" transform="rotate(-90 ${v.x - 14} ${(v.da + v.a) / 2})"`) +
    scTxt + `</g></symbol>`;
}

// ------------------------------------------------------- ingombri e scelta
// Ingombro della piatta: casa + balcone + piede + quote + nord + scala.
function bbox(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const Q = J.quote, NN = J.nord, SC = J.scala;
const flatBox = (() => {
  const pts = [];
  J.muri.forEach((r) => pts.push([r[0], r[1]], [r[2], r[3]]));
  J.stanze.forEach((s) => s.poli.forEach((p) => pts.push(p)));
  porte.forEach((p) => { if (!p.arco) { const w = Math.hypot(p.battuta[0] - p.cardine[0], p.battuta[1] - p.cardine[1]); pts.push([p.cardine[0] + p.verso[0] * w, p.cardine[1] + p.verso[1] * w]); } });
  pts.push([Q.verticale.x - 14 - Q.corpo, 0], [0, Q.orizzontale.y - 14 - Q.corpo]);
  pts.push([NN.c[0] - NN.r * 1.6, NN.c[1] - NN.r * 1.6], [NN.c[0] + NN.r * 1.6, NN.c[1] + NN.r * 1.6]);
  pts.push([SC.x - 20, SC.y], [SC.x + SC.tacche[SC.tacche.length - 1] + 40, SC.y + SC.h + Q.corpo + 10]);
  return bbox(pts);
})();
// punti 3D della pianta alzata (pavimento, teste dei muri, bandiere)
const pts3d = (() => {
  const p = [];
  const fb = bbox(J.stanze.flatMap((s) => s.poli).concat(J.muri.flatMap((r) => [[r[0], r[1]], [r[2], r[3]]])));
  rectPts(fb).forEach((q) => p.push([...q, 0]));
  J.muri.forEach((r) => rectPts(r).forEach((q) => p.push([...q, H])));
  J.bandiere.forEach((b) => p.push([b.piede[0], b.piede[1], AL.bandiera.asta], [b.piede[0] + AL.bandiera.drappo[0], b.piede[1], AL.bandiera.asta]));
  return p;
})();

// La scelta: ASPECT fisso 4/3 (riquadro basso nel primo schermo a 390 px),
// s il più grande possibile perché l'alzata (+4%) stia nel riquadro; il
// centro c si cerca su una griglia fine; vw minimo che contiene tutto.
export const ASPECT = 4 / 3;
function misura(s, c) {
  const A = s * ca, C = -s * sa, B = s * cb * sa, D = s * cb * ca, Z = s * sb;
  let hw = 0, hh = 0;
  const mg = 1 + AL.margine;
  for (const [x, y, z] of pts3d) {
    const X = A * (x - c[0]) + C * (y - c[1]), Y = B * (x - c[0]) + D * (y - c[1]) - Z * z;
    hw = Math.max(hw, Math.abs(X) * mg); hh = Math.max(hh, Math.abs(Y) * mg);
  }
  const mf = 1.02; // la piatta con un filo di respiro
  hw = Math.max(hw, (c[0] - flatBox[0]) * mf, (flatBox[2] - c[0]) * mf);
  hh = Math.max(hh, (c[1] - flatBox[1]) * mf, (flatBox[3] - c[1]) * mf);
  return Math.max(hw, hh * ASPECT); // semi-larghezza necessaria
}
function scegli() {
  const cx0 = (flatBox[0] + flatBox[2]) / 2, cy0 = (flatBox[1] + flatBox[3]) / 2;
  // semi-larghezza della sola piatta: l'alzata non deve allargare il riquadro
  const solo = Math.max((flatBox[2] - flatBox[0]) / 2 * 1.02, (flatBox[3] - flatBox[1]) / 2 * 1.02 * ASPECT);
  let best = null;
  for (let s = 0.7; s <= 1.4001; s += 0.005) {
    for (let dx = -200; dx <= 200; dx += 10) for (let dy = -200; dy <= 200; dy += 10) {
      const c = [cx0 + dx, cy0 + dy];
      const hw = misura(s, c);
      // prima: nessun ingrandimento del riquadro oltre la piatta; poi s massimo
      if (hw <= solo + 0.5 && (!best || s > best.s + 1e-9 || (Math.abs(s - best.s) < 1e-9 && hw < best.hw))) best = { s, c, hw };
    }
  }
  return best;
}
const SCELTA = scegli();
export const s = Math.round(SCELTA.s * 1000) / 1000;
const HW = Math.ceil(misura(s, SCELTA.c));
const VW = HW * 2, VH = Math.round(VW / ASPECT);
const CX = Math.round(SCELTA.c[0]), CY = Math.round(SCELTA.c[1]);
const VB = [CX - HW, CY - VH / 2, VW, VH];

// La matrice del pavimento nel sistema del viewBox (attorno al centro).
const A_ = s * ca, C_ = -s * sa, B_ = s * cb * sa, D_ = s * cb * ca, Z_ = s * sb;
const E_ = CX - (A_ * CX + C_ * CY), F_ = CY - (B_ * CX + D_ * CY);
// M: i 6 coefficienti della mappa affine piatta→alzata (unità del viewBox).
export const M = [A_, B_, C_, D_, E_, F_].map((v) => Math.round(v * 1e6) / 1e6);
const P2 = ([x, y]) => [A_ * x + C_ * y + E_, B_ * x + D_ * y + F_];
const P3 = ([x, y], z) => { const [X, Y] = P2([x, y]); return [X, Y - Z_ * z]; };
const pct = ([X, Y]) => [((X - VB[0]) / VB[2]) * 100, ((Y - VB[1]) / VB[3]) * 100];

// -------------------------------------------------- la pianta alzata (3D)
// Facce visibili: normale che, ruotata, guarda verso chi osserva.
const guarda = (n) => n[0] * sa + n[1] * ca > 1e-9;
const prof = (p) => p[0] * sa + p[1] * ca; // più grande = più vicino
function facce() {
  const L = [];
  for (const U of [casa3d, piede3d]) for (const f of U.faces) {
    if (!guarda(f.n)) continue;
    const q = [P3(f.a, 0), P3(f.b, 0), P3(f.b, H), P3(f.a, H)];
    L.push({ d: prof([(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2]), el: `<path${f.n[0] ? ' class="x"' : ''} d="${pathRel(q)}"/>` });
  }
  // parapetti sotto le finestre (davanzale sotto il taglio)
  for (const w of finTaglio) {
    const [x0, y0, x1, y1] = w.vano, z = w.davanzale;
    const U = unione([w.vano], []);
    for (const f of U.faces) {
      if (!guarda(f.n)) continue;
      const q = [P3(f.a, 0), P3(f.b, 0), P3(f.b, z), P3(f.a, z)];
      L.push({ d: prof([(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2]), el: `<path${f.n[0] ? ' class="x"' : ''} d="${pathRel(q)}"/>` });
    }
    const top = rectPts([x0, y0, x1, y1]).map((p) => P3(p, z));
    L.push({ d: prof([(x0 + x1) / 2, (y0 + y1) / 2]) + 0.01, el: `<path class="t" d="${pathRel(top)}"/>` });
  }
  L.sort((a, b) => a.d - b.d);
  return L.map((q) => q.el).join('');
}
function vetriAlTaglio() {
  let d = '';
  for (const w of finTaglio) {
    const [x0, y0, x1, y1] = w.vano;
    const horiz = x1 - x0 > y1 - y0;
    for (const t of [0.4, 0.6]) {
      const a = horiz ? [x0, y0 + (y1 - y0) * t] : [x0 + (x1 - x0) * t, y0];
      const b = horiz ? [x1, y0 + (y1 - y0) * t] : [x0 + (x1 - x0) * t, y1];
      d += pathRel([P3(a, H), P3(b, H)], false);
    }
  }
  return d;
}
function bandiere3d() {
  const [dw, dh] = AL.bandiera.drappo, h = AL.bandiera.asta;
  return J.bandiere.map((b) => {
    const p = b.piede, q = [p[0] + dw, p[1]];
    const drappo = [P3(p, h), P3(q, h), P3(q, h - dh), P3(p, h - dh)];
    return `<path d="${pathRel([P3(p, 0), P3(p, h)], false)}" stroke="#8a877e"/>` +
      `<path d="${pathRel(drappo)}" stroke="none" style="fill:var(--f-${b.id},#8a877e)"/>`;
  }).join('');
}
const mkPiatta = () => J.marcatori.map(([x, y], i) => `<rect data-mk="${i}" x="${x - 0.5}" y="${y - 0.5}" width="1" height="1"/>`).join('');
const mkAlzata = () => J.marcatori.map((p, i) => { const [X, Y] = P2(p); return `<rect data-mk="${i}" x="${f1(X - 0.5)}" y="${f1(Y - 0.5)}" width="1" height="1"/>`; }).join('');
const soggiorno = J.stanze.find((q) => q.id === 'soggiorno');
const datiSole = () => {
  const facciata = fin.filter((w) => w.sole);
  const f = facciata.map((w) => { const [x0, , x1, y1] = w.vano; return [x0, y1, x1, y1, w.davanzale, w.architrave]; });
  return JSON.stringify({ lat: J.sole.lat, lng: J.sole.lng, n: J.nord.angolo, o: [0, -1], m: M, f });
};
function alzataSVG() {
  const flo = `<use href="#pp" x="${VB[0]}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}" transform="matrix(${M.join(' ')})" style="--pp-fd:none"/>`;
  const cap = loopsD(casa3d.loops.concat(piede3d.loops), (p) => P3(p, H), f1);
  const dy = (z) => `--dy:${f1(Z_ * z)}px`;
  return `<svg class="alzata" viewBox="${VB.join(' ')}" aria-hidden="true" focusable="false" data-sole='${datiSole()}'>` +
    `<defs><clipPath id="pp-sc"><path d="${pathRel(soggiorno.poli.map(P2))}"/></clipPath></defs>` +
    flo +
    `<g class="sole" clip-path="url(#pp-sc)"></g>` +
    `<g class="m1" style="${dy(H)}">${facce()}</g>` +
    `<g class="m2" style="${dy(H * 0.66)}"><g fill="#060607" stroke="none"><path id="ppc" d="${cap}"/></g>` +
    `<use href="#ppc" fill="currentColor" stroke="none" mask="url(#ppm)"/><use href="#ppc" fill="none" stroke="currentColor"/></g>` +
    `<g class="m3" style="${dy(H * 0.33)}"><path d="${vetriAlTaglio()}" fill="none" stroke="currentColor"/>${bandiere3d()}</g>` +
    `<g class="mk">${mkAlzata()}</g></svg>`;
}

// ------------------------------------------------------------ etichette
// Posizioni in % del riquadro. Piatta: l'ancora del disegno + scarto; alzata:
// l'ancora proiettata + scarto. Gli scarti stanno qui (non nel JSON) perché
// sono decisioni d'impaginato verificate dal banco di prova a 288/358/560 px.
const SCARTI = {
  porta: { p: [0, 7.5], a: [0, 5] },
  cassaforte: { p: [5, -2], a: [3, -4] },
  soggiorno: { p: [0, 0], a: [0, -3] },
  cucina: { p: [0, 0], a: [0, -2] },
  scrivania: { p: [-2, 7], a: [-3, 4] },
  cassetta: { p: [6, 0], a: [4, 1] }
};
export function posizioni() {
  return J.etichette.map((e) => {
    const sc = SCARTI[e.stanza] || { p: [0, 0], a: [0, 0] };
    const pf = pct(e.ancora), pa = pct(P2(e.ancora));
    return { stanza: e.stanza, x: pf[0] + sc.p[0], y: pf[1] + sc.p[1], xa: pa[0] + sc.a[0], ya: pa[1] + sc.a[1] };
  });
}
function etichette() {
  const pos = posizioni();
  return `<nav class="stanze" aria-label="Le stanze">` + J.etichette.map((e, i) => {
    const q = pos[i];
    const sp = e.spenta ? ` <i><span aria-hidden="true">⚑ </span>${e.spenta} spenta</i>` : '';
    return `<a class="et${e.spenta ? ' sp' : ''}" href="${e.href}" data-stanza="${e.stanza}" style="--x:${f1(q.x)}%;--y:${f1(q.y)}%;--xa:${f1(q.xa)}%;--ya:${f1(q.ya)}%"><b>${e.testo}</b>${sp}</a>`;
  }).join('') + `</nav>`;
}

// ------------------------------------------------------------ esportati
const USE = (id) => `<use href="#${id}" x="${VB[0]}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}"/>`;
const DEFS = () => `<svg class="pp-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>` +
  `<pattern id="pph" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V11" stroke="#fff" stroke-width="2.2"/></pattern>` +
  `<mask id="ppm" maskUnits="userSpaceOnUse" x="-600" y="-600" width="2800" height="2800"><rect x="-600" y="-600" width="2800" height="2800" fill="url(#pph)"/></mask>` +
  simboloPP() + simboloPQ() + `</defs></svg>`;

export function riquadro() {
  return DEFS() +
    `<svg class="pq-o" viewBox="${VB.join(' ')}" aria-hidden="true" focusable="false">${USE('pq')}</svg>` +
    `<svg class="piatta" viewBox="${VB.join(' ')}" aria-hidden="true" focusable="false">${USE('pp')}<g class="mk">${mkPiatta()}</g></svg>` +
    alzataSVG() + etichette();
}

export const STANZE = J.etichette.map((e) => e.stanza);
export function ritaglio(stanza) {
  const r = J.ritagli[stanza];
  if (!r) throw new Error('ritaglio: stanza sconosciuta ' + stanza);
  return `<svg class="ritaglio" data-stanza="${stanza}" viewBox="${r[0]} ${r[1]} ${r[2] - r[0]} ${r[3] - r[1]}" aria-hidden="true" focusable="false">${USE('pp')}</svg>`;
}

export function accesa() {
  const b = flatBox, m = 10;
  return `<svg class="pianta-accesa" viewBox="${b[0] - m} ${b[1] - m} ${b[2] - b[0] + 2 * m} ${b[3] - b[1] + 2 * m}" aria-hidden="true" focusable="false">${USE('pq')}${USE('pp')}</svg>`;
}

// Il palazzo: cinque piani della stessa pianta, in assonometria, impilati.
// Ogni solaio è opaco (nasconde il piano di sotto), il portone solo a terra.
export function palazzo() {
  const n = J.palazzo.piani, dz = J.palazzo.interpiano;
  const sp = 0.5; // scala del disegno del palazzo
  const a = sp * ca, c = -sp * sa, b = sp * cb * sa, d = sp * cb * ca, zz = sp * sb * dz;
  const casa = [[0, 0], [1020, 0], [1020, 540], [1140, 540], [1140, 800], [1020, 800], [1020, 840], [0, 840]];
  const pr = ([x, y]) => [a * x + c * y, b * x + d * y];
  const pts = [];
  for (let i = 0; i < n; i++) casa.forEach((p) => { const [X, Y] = pr(p); pts.push([X, Y - zz * i]); });
  const foot = rectPts([600, 880, 1020, 990]).map(pr);
  const bb = bbox(pts.concat(foot)), m = 12;
  let g = '';
  for (let i = 0; i < n; i++) {
    const ty = -zz * i;
    const sol = pathRel(casa.map(pr).map(([X, Y]) => [X, Y + ty]));
    g += `<path d="${sol}" fill="#060607" stroke="none"/>` +
      `<use href="#pp" x="${VB[0]}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}" transform="matrix(${[a, b, c, d, 0, ty].map((v) => f1(v * 1000) / 1000).join(' ')})"${i ? ' style="--pp-pt:none;--pp-fd:none"' : ' style="--pp-fd:none"'}/>`;
  }
  // gli spigoli del palazzo, da terra all'ultimo solaio
  const spig = [[0, 0], [0, 840], [1020, 840]].map((p) => { const [X, Y] = pr(p); return `M${f1(X)} ${f1(Y)}V${f1(Y - zz * (n - 1))}`; }).join('');
  return `<svg class="palazzo" viewBox="${f1(bb[0] - m)} ${f1(bb[1] - m)} ${f1(bb[2] - bb[0] + 2 * m)} ${f1(bb[3] - bb[1] + 2 * m)}" aria-hidden="true" focusable="false">` +
    `<path d="${spig}" fill="none" stroke="currentColor" stroke-width=".75" stroke-opacity=".5" ${VE}/>${g}</svg>`;
}

// I 4 marcatori d'angolo (spigoli esterni della casa): coordinate in pianta,
// in % del riquadro da piatti e da alzati. Il banco di prova li misura.
export function markers() {
  return J.marcatori.map((p) => {
    const f = pct(p), a = pct(P2(p));
    return { pianta: p, piatta: f, alzata: a };
  });
}

// Superficie calpestabile: somma delle stanze interne (armadio a muro,
// balcone e androne esclusi). Shoelace sui poligoni in cm².
export function superficie() {
  const area = (poly) => Math.abs(poly.reduce((acc, [x, y], i) => { const [u, v] = poly[(i + 1) % poly.length]; return acc + x * v - u * y; }, 0)) / 2;
  return J.stanze.filter((q) => !q.esterno && !q.nonCalpestabile).reduce((acc, q) => acc + area(q.poli), 0) / 10000;
}
export const VIEWBOX = VB.slice();
export const INFO = { flatBox, centro: [CX, CY], sScelto: SCELTA.s };
