// Texture procedurali su canvas: nessuna immagine scaricata, tutto deterministico (seed fisso).
// Ogni texture e' pensata in METRI (la scena la mappa con uv = coordinate / periodo) e si ripete
// senza cuciture. I colori caldi stanno a OKLCH h >= 57 e C <= 0,08: niente che tiri al rosso.

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash2 = (i, j, s) => rng((i * 73856093) ^ (j * 19349663) ^ s)();
function tela(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// OKLCH -> sRGB (per scegliere i toni del cotto direttamente nello spazio che controlla la tinta)
export function oklch(L, C, h, a = 1) {
  const hr = (h * Math.PI) / 180, A = C * Math.cos(hr), B = C * Math.sin(hr);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  const g = lin.map((v) => { v = Math.min(1, Math.max(0, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); });
  return `rgba(${g[0]},${g[1]},${g[2]},${a})`;
}

// rumore di valore periodico (periodo p celle), per intonaco, pietra, trama
function rumore(n, p, seed) {
  const R = rng(seed), v = new Float32Array(p * p); for (let i = 0; i < v.length; i++) v[i] = R();
  const f = (x, y) => v[((y % p) + p) % p * p + ((x % p) + p) % p];
  const out = new Float32Array(n * n), k = p / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = x * k, fy = y * k, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = f(x0, y0), b = f(x0 + 1, y0), c = f(x0, y0 + 1), d = f(x0 + 1, y0 + 1);
    out[y * n + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}
function daCampo(n, campo) { // campo(x, y) -> [r, g, b] 0..255
  const c = tela(n), g = c.getContext('2d'), im = g.createImageData(n, n), d = im.data;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const [r, gg, b] = campo(x, y), i = (y * n + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; }
  g.putImageData(im, 0, 0); return c;
}

// ── PAVIMENTI ─────────────────────────────────────────────────────────────────
// Parquet a spina italiana, rovere, doghe 70 x 420 mm posate a 45 gradi.
// Reticolo t1 = (W, W), t2 = (L, -L); ruotato di -45 gradi diventa rettangolare con passi W*sqrt2
// e L*sqrt2, quindi una tessera di 24 x 4 celle (2,376 m) si ripete senza cuciture.
export const SPINA_M = 24 * 0.07 * Math.SQRT2;
export function spina(n = 1024) {
  const c = tela(n), g = c.getContext('2d');
  const W = 0.07, L = 0.42, s = n / SPINA_M;
  g.fillStyle = '#6E5236'; g.fillRect(0, 0, n, n);
  const rot = (x, y) => [((x + y) / Math.SQRT2) * s, ((-x + y) / Math.SQRT2) * s];
  const doga = (x0, y0, w, h, i, j, tipo) => {
    const ii = ((i % 24) + 24) % 24, jj = ((j % 4) + 4) % 4;
    const P = [rot(x0, y0), rot(x0 + w, y0), rot(x0 + w, y0 + h), rot(x0, y0 + h)];
    const k = hash2(ii, jj, tipo), k2 = hash2(ii, jj, tipo + 7), R = rng(Math.floor(k * 1e9) + tipo);
    const lungo = w > h;
    const path = () => { g.beginPath(); g.moveTo(...P[0]); for (let q = 1; q < 4; q++) g.lineTo(...P[q]); g.closePath(); };
    path();
    // tono della doga: rovere naturale, con poche doghe piu' scure o piu' chiare (la natura del legno)
    const L0 = 43 + k * 12 + (k2 > 0.92 ? -7 : k2 < 0.06 ? 6 : 0);
    const a = lungo ? rot(x0, y0 + h / 2) : rot(x0 + w / 2, y0), b = lungo ? rot(x0 + w, y0 + h / 2) : rot(x0 + w / 2, y0 + h);
    const gr = g.createLinearGradient(a[0], a[1], b[0], b[1]);
    gr.addColorStop(0, hsl(31 + k2 * 5, 36 + k * 8, L0 - 1.5)); gr.addColorStop(0.5, hsl(33 + k2 * 4, 38 + k * 8, L0 + 1.5)); gr.addColorStop(1, hsl(31 + k2 * 5, 36 + k * 8, L0 - 2));
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    // venatura: fibre lunghe, leggermente ondulate, e qualche fiamma
    for (let v = 0; v < 14; v++) {
      const t = R(), ond = (R() - 0.5) * 0.25, spess = 0.4 + R() * 1.3;
      g.strokeStyle = hsl(28, 42, 20 + R() * 22, 0.07 + R() * 0.12); g.lineWidth = spess;
      g.beginPath();
      for (let q = 0; q <= 8; q++) {
        const u = q / 8, off = t + ond * Math.sin(u * Math.PI * (1 + R() * 0.5));
        const p = lungo ? rot(x0 + u * w, y0 + off * h) : rot(x0 + off * w, y0 + u * h);
        if (q) g.lineTo(...p); else g.moveTo(...p);
      }
      g.stroke();
    }
    if (R() < 0.12) { // un nodo piccolo
      const u = 0.2 + R() * 0.6, p = lungo ? rot(x0 + u * w, y0 + h * (0.3 + R() * 0.4)) : rot(x0 + w * (0.3 + R() * 0.4), y0 + u * h);
      g.fillStyle = hsl(28, 40, 24, 0.35); g.beginPath(); g.ellipse(p[0], p[1], 1.8, 1.1, Math.PI / 4, 0, 6.283); g.fill();
    }
    g.restore();
    // la fuga: filo scuro e un filo di luce sul bordo opposto (smusso)
    g.strokeStyle = 'rgba(40,26,14,.62)'; g.lineWidth = 1.2; path(); g.stroke();
    g.strokeStyle = 'rgba(255,236,205,.10)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(P[0][0] + 1, P[0][1] + 1); g.lineTo(P[1][0] + 1, P[1][1] + 1); g.stroke();
  };
  for (let i = -40; i < 80; i++) for (let j = -14; j < 14; j++) {
    const ox = i * W + j * L, oy = i * W - j * L;
    const p = rot(ox, oy); if (p[0] < -700 || p[0] > n + 700 || p[1] < -700 || p[1] > n + 700) continue;
    doga(ox, oy, L, W, i, j, 1);
    doga(ox + L, oy + W - L, W, L, i, j, 2);
  }
  return c;
}

// Cotto 30 x 30, tono tabacco (non rosso): ogni pianella ha il suo tono, la sua marezzatura,
// gli spigoli un po' consumati; fughe di calce di 5 mm.
export const COTTO_M = 2.40;
export function cotto(n = 1024) {
  const c = tela(n), g = c.getContext('2d'), s = n / COTTO_M, t = 0.30 * s, f = Math.max(1.5, 0.005 * s);
  g.fillStyle = oklch(0.74, 0.02, 80); g.fillRect(0, 0, n, n);
  const R = rng(11);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const x0 = i * t + f / 2, y0 = j * t + f / 2, w = t - f;
    const L0 = 0.555 + R() * 0.085, C0 = 0.052 + R() * 0.024, h0 = 58 + R() * 12;
    g.save(); g.beginPath(); g.roundRect ? g.roundRect(x0, y0, w, w, 2.5) : g.rect(x0, y0, w, w); g.clip();
    g.fillStyle = oklch(L0, C0, h0); g.fillRect(x0, y0, w, w);
    // marezzatura: macchie morbide chiare e scure
    for (let b = 0; b < 30; b++) {
      const r = 3 + R() * t * 0.35, x = x0 + R() * w, y = y0 + R() * w, chiaro = R() < 0.5;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, oklch(L0 + (chiaro ? 0.07 : -0.08), C0 * 0.9, h0 + 2, 0.16)); gr.addColorStop(1, oklch(L0, C0, h0, 0));
      g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // grana e pori
    for (let b = 0; b < 140; b++) { g.fillStyle = oklch(L0 - 0.18, 0.03, 65, 0.18 + R() * 0.25); g.fillRect(x0 + R() * w, y0 + R() * w, 0.7 + R() * 1.2, 0.7 + R() * 1.2); }
    // bordo consumato: piu' scuro vicino alla fuga
    const e = g.createLinearGradient(x0, 0, x0 + w, 0); e.addColorStop(0, 'rgba(40,28,18,.18)'); e.addColorStop(0.06, 'rgba(40,28,18,0)'); e.addColorStop(0.94, 'rgba(40,28,18,0)'); e.addColorStop(1, 'rgba(40,28,18,.18)');
    g.fillStyle = e; g.fillRect(x0, y0, w, w);
    const e2 = g.createLinearGradient(0, y0, 0, y0 + w); e2.addColorStop(0, 'rgba(40,28,18,.16)'); e2.addColorStop(0.06, 'rgba(40,28,18,0)'); e2.addColorStop(0.94, 'rgba(40,28,18,0)'); e2.addColorStop(1, 'rgba(255,240,220,.10)');
    g.fillStyle = e2; g.fillRect(x0, y0, w, w);
    g.restore();
  }
  return c;
}

// Marmo bianco venato, lastre 60 x 60.
export const MARMO_M = 2.40;
export function marmo(n = 1024) {
  const c = tela(n), g = c.getContext('2d'), s = n / MARMO_M, t = 0.60 * s;
  g.fillStyle = '#ECEBE7'; g.fillRect(0, 0, n, n);
  const R = rng(5);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    g.save(); g.beginPath(); g.rect(i * t, j * t, t, t); g.clip();
    g.fillStyle = hsl(40, 8, 90 + R() * 4); g.fillRect(i * t, j * t, t, t);
    const ang = R() * Math.PI;
    for (let v = 0; v < 7; v++) {
      let x = i * t + R() * t, y = j * t + R() * t; const dx = Math.cos(ang), dy = Math.sin(ang);
      const forte = R() < 0.35;
      g.strokeStyle = `rgba(118,116,112,${forte ? 0.32 + R() * 0.2 : 0.10 + R() * 0.14})`; g.lineWidth = forte ? 0.9 + R() * 1.6 : 0.5 + R();
      g.shadowColor = 'rgba(120,118,112,.35)'; g.shadowBlur = 2 + R() * 5;
      g.beginPath(); g.moveTo(x - dx * t, y - dy * t);
      for (let q = -6; q <= 6; q++) { x += dx * t / 6 + (R() - 0.5) * 16; y += dy * t / 6 + (R() - 0.5) * 16; g.lineTo(x, y); }
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(160,158,150,.5)'; g.lineWidth = 1; g.strokeRect(i * t + 0.5, j * t + 0.5, t - 1, t - 1);
  }
  return c;
}

// ── INVOLUCRO E ARREDI (in scala di grigi o quasi: il colore lo mette la scena) ────
// Intonaco a calce: grana appena percettibile, periodo 1,6 m.
export const INTONACO_M = 1.6;
export function intonaco(n = 256) {
  const a = rumore(n, 8, 21), b = rumore(n, 32, 22), d = rumore(n, 96, 23);
  return daCampo(n, (x, y) => { const i = y * n + x, v = 238 + (a[i] - 0.5) * 7 + (b[i] - 0.5) * 5 + (d[i] - 0.5) * 4; return [v, v, v]; });
}
// Travertino: bande sedimentarie orizzontali e pori allungati. Periodo 1,2 m.
export const TRAVERTINO_M = 1.2;
export function travertino(n = 512) {
  const c = tela(n), g = c.getContext('2d'), R = rng(31);
  const bande = rumore(n, 6, 32), fine = rumore(n, 48, 33);
  const im = g.createImageData(n, n), dd = im.data;
  for (let y = 0; y < n; y++) {
    const u = y / n, ond = Math.sin(u * Math.PI * 2 * 3) * 0.5 + Math.sin(u * Math.PI * 2 * 11 + 1.3) * 0.3 + Math.sin(u * Math.PI * 2 * 29 + 0.4) * 0.2;
    for (let x = 0; x < n; x++) {
      const k = y * n + x, v = 234 + ond * 5 + (bande[((y * 4) % n) * n + x] - 0.5) * 6 + (fine[k] - 0.5) * 4, i = k * 4;
      dd[i] = v + 2; dd[i + 1] = v - 1; dd[i + 2] = v - 7; dd[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  for (let k = 0; k < 16; k++) { // vene sottili, quasi orizzontali
    const y = R() * n; g.strokeStyle = `rgba(150,132,104,${0.10 + R() * 0.12})`; g.lineWidth = 0.6 + R() * 1.2; g.beginPath();
    for (let x = -8; x <= n + 8; x += 16) { const yy = y + Math.sin(x / 70 + k) * 3 + (R() - 0.5) * 2; if (x < 0) g.moveTo(x, yy); else g.lineTo(x, yy); } g.stroke();
  }
  for (let k = 0; k < 260; k++) { // pori: pochi, allungati in orizzontale, ripetuti ai bordi
    const x = R() * n, y = R() * n, w = 1 + R() * 5, h = 0.5 + R() * 1.1;
    g.fillStyle = `rgba(138,120,94,${0.08 + R() * 0.16})`;
    for (const [ox, oy] of [[0, 0], [-n, 0], [0, -n], [-n, -n]]) { g.beginPath(); g.ellipse(x + ox, y + oy, w, h, 0, 0, 6.283); g.fill(); }
  }
  return c;
}
// Venatura del legno per gli arredi (periodo 0,9 m lungo la fibra).
export const LEGNO_M = 0.9;
export function legno(n = 512) {
  const R = rng(41), off = rumore(n, 4, 42), fine = rumore(n, 64, 43);
  const fasi = Array.from({ length: 5 }, () => R() * 6.283);
  return daCampo(n, (x, y) => {
    const i = y * n + x, u = y / n, w = x / n;
    const anelli = Math.sin((u * 34 + off[i] * 3.2 + Math.sin(w * 6.283 + fasi[0]) * 0.35) * 6.283) * 0.5 + 0.5;
    const fibra = Math.sin((u * 170 + off[i] * 9) * 6.283) * 0.5 + 0.5;
    const v = 216 + anelli * 13 + fibra * 3 + (fine[i] - 0.5) * 9;
    return [v, v * 0.97, v * 0.93];
  });
}
// Trama dei tessuti: tela fitta, periodo 0,24 m.
export const TRAMA_M = 0.24;
export function trama(n = 256) {
  const a = rumore(n, 16, 51);
  return daCampo(n, (x, y) => {
    const tx = (x % 4) < 2 ? 1 : 0, ty = (y % 4) < 2 ? 1 : 0, filo = tx ^ ty ? 5 : -5, i = y * n + x;
    const v = 232 + filo + (a[i] - 0.5) * 7;
    return [v, v, v];
  });
}
export function bianco() { const c = tela(4); const g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 4, 4); return c; }

// Occlusione finta: una sola tela per tutto. Sinistra: striscia lungo il muro (buio al muro,
// trasparente verso la stanza). Destra: macchia rotonda sotto gli arredi.
export function occlusione(n = 128) {
  const c = tela(2 * n, n), g = c.getContext('2d');
  const l = g.createLinearGradient(0, 0, 0, n); l.addColorStop(0, 'rgba(0,0,0,1)'); l.addColorStop(0.35, 'rgba(0,0,0,.42)'); l.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = l; g.fillRect(0, 0, n, n);
  const r = g.createRadialGradient(1.5 * n, n / 2, 0, 1.5 * n, n / 2, n / 2); r.addColorStop(0, 'rgba(0,0,0,.9)'); r.addColorStop(0.55, 'rgba(0,0,0,.35)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(n, 0, n, n);
  return c;
}
// La finestra accesa di sera: sinistra il vetro caldo (piu' luce in basso, tende ai lati),
// destra l'alone. Colore: luce di casa #FFE3B8, MAI oro.
export function sera(n = 128) {
  const c = tela(2 * n, n), g = c.getContext('2d');
  const v = g.createLinearGradient(0, 0, 0, n); v.addColorStop(0, 'rgba(255,214,160,.78)'); v.addColorStop(0.55, 'rgba(255,227,184,1)'); v.addColorStop(1, 'rgba(255,238,210,1)');
  g.fillStyle = v; g.fillRect(0, 0, n, n);
  const t = g.createLinearGradient(0, 0, n, 0); t.addColorStop(0, 'rgba(120,80,40,.38)'); t.addColorStop(0.16, 'rgba(120,80,40,0)'); t.addColorStop(0.84, 'rgba(120,80,40,0)'); t.addColorStop(1, 'rgba(120,80,40,.38)');
  g.fillStyle = t; g.fillRect(0, 0, n, n);
  const r = g.createRadialGradient(1.5 * n, n / 2, 0, 1.5 * n, n / 2, n / 2); r.addColorStop(0, 'rgba(255,227,184,.9)'); r.addColorStop(0.3, 'rgba(255,227,184,.32)'); r.addColorStop(1, 'rgba(255,227,184,0)');
  g.fillStyle = r; g.fillRect(n, 0, n, n);
  return c;
}

// Atlante dei decori (512 x 512): due quadri astratti, i dorsi dei libri, una tela neutra.
// Toni di sabbia, ardesia, salvia e ocra spenta; niente rosso.
export const DECORO = { quadro1: [0, 0, 0.5, 0.5], quadro2: [0.5, 0, 1, 0.5], libri: [0, 0.5, 1, 0.625], quadro3: [0, 0.625, 0.5, 1], pieghe: [0.5, 0.625, 1, 0.75], neutro: [0.75, 0.8, 1, 1] };
export function decoro(n = 512) {
  const c = tela(n), g = c.getContext('2d'), R = rng(61), h = n / 2;
  g.fillStyle = '#EDEAE3'; g.fillRect(0, 0, n, n);
  // quadro 1: campi morbidi sovrapposti
  g.fillStyle = '#D9D2C3'; g.fillRect(0, 0, h, h);
  const campo = (x, y, w, hh, col) => { g.fillStyle = col; g.globalAlpha = 0.92; g.fillRect(x, y, w, hh); g.globalAlpha = 1; };
  campo(24, 26, h - 48, h * 0.42, '#3E4A5C'); campo(24, 26 + h * 0.46, h - 48, h * 0.16, '#B59B6A'); campo(24, 26 + h * 0.66, h - 48, h * 0.24, '#7F8A74');
  for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(255,255,255,${R() * 0.06})`; g.fillRect(R() * h, R() * h, 2, 2); }
  // quadro 2: orizzonte della campagna romana, linee sottili
  g.fillStyle = '#E6E1D6'; g.fillRect(h, 0, h, h);
  g.fillStyle = '#C9C2B2'; g.fillRect(h + 18, h * 0.58, h - 36, h * 0.34);
  g.strokeStyle = '#4A5360'; g.lineWidth = 2; g.beginPath(); g.moveTo(h + 18, h * 0.58);
  for (let x = 0; x <= h - 36; x += 8) g.lineTo(h + 18 + x, h * 0.58 - 10 * Math.sin(x / 40) - 6 * Math.sin(x / 13));
  g.stroke();
  g.fillStyle = '#6C7866'; for (let k = 0; k < 7; k++) { const x = h + 40 + R() * (h - 80); g.fillRect(x, h * 0.46, 3, h * 0.12); g.beginPath(); g.ellipse(x + 1.5, h * 0.44, 10, 16, 0, 0, 6.283); g.fill(); }
  // dorsi dei libri: striscia ripetibile
  const y0 = h, y1 = n * 0.625; let x = 0;
  const cols = ['#3E4452', '#8E8981', '#C9C0B1', '#56606C', '#B8A58A', '#2A3342', '#E2DDD2', '#6E675F', '#7F8A74', '#A89F90'];
  while (x < n) { const w = 6 + R() * 12, col = cols[Math.floor(R() * cols.length)], top = y0 + R() * 10; g.fillStyle = col; g.fillRect(x, top, w - 1, y1 - top); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 2, top + 8, w - 5, 2); g.fillRect(x + 2, y1 - 12, w - 5, 2); x += w; }
  // pieghe delle tende: ombre morbide verticali, sei pieghe per telo
  for (let x = 0; x < h; x++) { const u = x / h, v = 0.80 + 0.2 * (0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 6)) - 0.05 * Math.pow(Math.sin(u * Math.PI * 12 + 1), 8); const L = Math.round(255 * v); g.fillStyle = `rgb(${L},${L},${L})`; g.fillRect(h + x, n * 0.625, 1, n * 0.125); }
  // quadro 3: una grafica a righe
  g.fillStyle = '#F1EEE7'; g.fillRect(0, n * 0.625, h, n * 0.375);
  for (let k = 0; k < 9; k++) { g.fillStyle = k % 2 ? '#56606C' : '#B59B6A'; g.fillRect(30 + k * 22, n * 0.66, 12, n * 0.3); }
  return c;
}

// Le cifre delle quote (atto 1), in un atlante: una riga per numero, JetBrains Mono.
export function cifre(testi, colore) {
  const c = tela(512, 64 * testi.length), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = colore; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '500 40px "JetBrains Mono", ui-monospace, monospace';
  testi.forEach((t, i) => g.fillText(t, 256, 32 + i * 64));
  return c;
}

// ── I FOGLI (atto 2): visura, planimetria, APE, conformita'. Solo barre grigie, nessuna cifra.
// La planimetria disegna tutti i muri tranne M8: quel tramezzo lo porta la scena come linea a parte,
// perche' sulla carta e' 60 cm fuori posto e poi viene corretto (il muro non si sposta mai).
export function foglio(tipo, plan, accento) {
  const pl = tipo === 'planimetria' || tipo === 'lucido';
  const W = pl ? 1536 : 512, Hh = pl ? Math.round(1536 * 10.6 / 15.0) : 724;
  const c = tela(W, Hh), g = c.getContext('2d');
  const titolo = { visura: 'VISURA', planimetria: 'PLANIMETRIA', lucido: 'PLANIMETRIA', ape: 'APE', conformita: 'CONFORMITÀ' }[tipo];
  if (pl) {
    const s = W / 15.0, ox = 1.5 * s, oz = 0.6 * s; // foglio 15,0 x 10,6 m: la pianta combacia 1:1
    const lucido = tipo === 'lucido';
    if (!lucido) { g.fillStyle = '#FBFAF7'; g.fillRect(0, 0, W, Hh); }
    const inch = lucido ? '#FFFFFF' : '#16161A';
    // sul lucido i muri sono contorni (si vede sotto il costruito); sulla carta sono campiture
    g.strokeStyle = inch; g.fillStyle = inch; g.lineWidth = lucido ? 3 : 1;
    for (const [i, [x0, z0, x1, z1]] of plan.WALLS.entries()) {
      if (i === 8) continue;
      if (lucido) g.strokeRect(ox + x0 * s, oz + z0 * s, (x1 - x0) * s, (z1 - z0) * s); else g.fillRect(ox + x0 * s, oz + z0 * s, (x1 - x0) * s, (z1 - z0) * s);
    }
    for (const o of plan.OPENINGS) {
      const [x0, z0, x1, z1] = plan.WALLS[o.wall]; const lungoX = x1 - x0 >= z1 - z0;
      g.save();
      g.globalCompositeOperation = lucido ? 'destination-out' : 'source-over'; g.fillStyle = '#FBFAF7';
      if (lungoX) g.fillRect(ox + (o.c - o.w / 2) * s + 2, oz + z0 * s - 3, o.w * s - 4, (z1 - z0) * s + 6);
      else g.fillRect(ox + x0 * s - 3, oz + (o.c - o.w / 2) * s + 2, (x1 - x0) * s + 6, o.w * s - 4);
      g.restore();
      if ((o.k === 'finestra' || o.k === 'portafinestra') && lungoX) {
        g.strokeStyle = inch; g.lineWidth = 1.5;
        for (const f of [0.38, 0.62]) { const zm = oz + (z0 + (z1 - z0) * f) * s; g.beginPath(); g.moveTo(ox + (o.c - o.w / 2) * s, zm); g.lineTo(ox + (o.c + o.w / 2) * s, zm); g.stroke(); }
      }
    }
    if (!lucido) {
      g.font = '700 30px "JetBrains Mono", monospace'; g.fillStyle = '#16161A'; g.fillText(titolo, W - 350, Hh - 38);
      g.strokeStyle = '#16161A'; g.lineWidth = 2; g.strokeRect(W - 380, Hh - 92, 350, 74);
      g.fillStyle = '#D3D3DA'; g.fillRect(W - 364, Hh - 30, 220, 6);
    }
    return c;
  }
  g.fillStyle = '#FBFAF7'; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#16161A'; g.font = '700 26px "JetBrains Mono", monospace';
  const barre = (x, y, n, w0) => { const R = rng(tipo.length * 97); for (let i = 0; i < n; i++) { g.fillStyle = i === 0 ? accento : '#D3D3DA'; g.fillRect(x, y + i * 26, w0 * (0.45 + R() * 0.55), 9); } };
  g.fillText(titolo, 40, 64); g.fillStyle = accento; g.fillRect(40, 84, 60, 5);
  barre(40, 130, 6, 420);
  if (tipo === 'ape') { const cols = ['#1C2A6B', '#24378A', '#2E46A6', '#4A60B8', '#7283C8', '#9CA8D8', '#C5CCE8']; cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(40, 330 + i * 34, 140 + i * 38, 26); }); }
  else if (tipo === 'visura') { for (let i = 0; i < 5; i++) { g.strokeStyle = '#D3D3DA'; g.lineWidth = 2; g.strokeRect(40, 330 + i * 52, 432, 40); g.fillStyle = '#E4E4E9'; g.fillRect(52, 344 + i * 52, 120 + (i * 37) % 160, 10); } }
  else { g.strokeStyle = accento; g.lineWidth = 6; g.beginPath(); g.arc(256, 470, 90, 0, 6.283); g.stroke(); g.beginPath(); g.moveTo(206, 472); g.lineTo(244, 510); g.lineTo(310, 434); g.stroke(); }
  g.strokeStyle = '#E4E4E9'; g.lineWidth = 2; g.strokeRect(14, 14, W - 28, Hh - 28);
  return c;
}
