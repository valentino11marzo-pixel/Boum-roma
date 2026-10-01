// Il marchio della famiglia: BOOM = cerchi annidati tangenti in un punto; Egidi = archi annidati sulla stessa soglia.
export function archi({ n = 7, stroke = '#111', sw = 2.2, fill = 'none', size = 120, soglia = false } = {}) {
  const W = 100, H = 120, base = 116;
  let p = '';
  for (let i = 0; i < n; i++) {
    const k = Math.pow(0.78, i);             // stessa progressione "a cannocchiale" dei cerchi BOOM
    const w = 84 * k, h = 108 * k, x0 = 50 - w / 2, x1 = 50 + w / 2, r = w / 2;
    p += `<path d="M${x0.toFixed(2)} ${base} V${(base - h + r).toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${(base - h + r).toFixed(2)} V${base}" fill="${i === n - 1 ? stroke : fill}" stroke="${stroke}" stroke-width="${(sw * (1 - i * 0.06)).toFixed(2)}" stroke-linecap="butt"/>`;
  }
  if (soglia) p += `<line x1="4" y1="${base}" x2="96" y2="${base}" stroke="${stroke}" stroke-width="${sw}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${size * W / H}" height="${size}" aria-hidden="true">${p}</svg>`;
}
