// Pianta "alla Nolli" STILIZZATA e procedurale: isolati neri (poché), strade e cortili chiari.
// Non è la mappa vera del rione: è il linguaggio grafico (figura-sfondo) per mostrarlo.
export function nolli({ W = 700, H = 640, cw = 92, ch = 78, seed = 7, ink = '#2B2926', ground = '#E6DCC8', accent = '#4E8B7A', street = 9, hi = [4, 4], pin = true, piazza = null, fiume = false, via = true } = {}) {
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const nx = Math.ceil(W / cw) + 2, ny = Math.ceil(H / ch) + 2, P = [];
  for (let i = 0; i < nx; i++) { P[i] = []; for (let j = 0; j < ny; j++) P[i][j] = [i * cw - cw + (r() - .5) * cw * .42 + j * 9, j * ch - ch + (r() - .5) * ch * .42 - i * 4]; }
  const inset = (q, d) => { const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4; return q.map(([x, y]) => { const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy); return [x - dx / L * d, y - dy / L * d]; }); };
  const scale = (q, k) => { const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4; return q.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]); };
  const d = q => 'M' + q.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + 'Z';
  let out = '', hiQ = null;
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
    if ((i === 2 && j === 5) || (i === 3 && j === 5)) continue;           // la piazza
    const q = inset([P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1]], street);
    const isHi = i === hi[0] && j === hi[1];
    // isolato diviso in due palazzi a volte (il lotto romano non è mai uno solo)
    let path = d(q);
    if (r() < .62) path += ' ' + d(scale(q, .26 + r() * .16));            // cortile
    out += `<path d="${path}" fill="${isHi ? accent : ink}" fill-rule="evenodd"/>`;
    if (isHi) hiQ = q;
    if (!isHi && r() < .35) { const a = q[0], b = q[1], c = q[2], e = q[3], m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m2 = [(e[0] + c[0]) / 2, (e[1] + c[1]) / 2]; out += `<line x1="${m1[0]}" y1="${m1[1]}" x2="${m2[0]}" y2="${m2[1]}" stroke="${ground}" stroke-width="1.4"/>`; }
  }
  // la via dritta che taglia il rione (sopra gli isolati)
  if (via) out += `<line x1="-20" y1="${H * .78}" x2="${W + 20}" y2="${H * .22}" stroke="${ground}" stroke-width="${street * 1.7}"/>`;
  if (piazza) { const [px, py, pw, ph, rot] = piazza; out += `<rect x="${px - pw / 2}" y="${py - ph / 2}" width="${pw}" height="${ph}" rx="${pw / 2}" transform="rotate(${rot} ${px} ${py})" fill="${ground}" stroke="${ink}" stroke-width="1.2" stroke-dasharray="2 3"/>`; }
  if (fiume) { out += `<path d="M${-30} ${H * .05} C ${W * .30} ${H * .18}, ${W * .05} ${H * .62}, ${W * .22} ${H + 30}" fill="none" stroke="#D3C6AC" stroke-width="${street * 7}"/><path d="M${-30} ${H * .05} C ${W * .30} ${H * .18}, ${W * .05} ${H * .62}, ${W * .22} ${H + 30}" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width="1" stroke-dasharray="1 5"/>`; }
  let p = '';
  if (pin && hiQ) { const cx = hiQ.reduce((a, q) => a + q[0], 0) / 4, cy = hiQ.reduce((a, q) => a + q[1], 0) / 4; p = `<g><circle cx="${cx}" cy="${cy}" r="5" fill="${ground}"/></g>`; }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="display:block;background:${ground}">${out}${p}</svg>`;
}
