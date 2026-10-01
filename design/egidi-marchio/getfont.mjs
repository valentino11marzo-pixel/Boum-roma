// node getfont.mjs "Family:wght@300..800" ...  → fonts/*.woff2 + fonts/fonts.css (solo subset latin)
import { writeFileSync, appendFileSync, existsSync } from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
for (const fam of process.argv.slice(2)) {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=' + fam.replace(/ /g, '+') + '&display=swap', { headers: { 'user-agent': UA } })).text();
  const blocks = css.split('/* ').filter(b => b.startsWith('latin */'));
  if (!blocks.length) { console.log('NO', fam, css.slice(0, 120)); continue; }
  for (const b of blocks) {
    const url = b.match(/url\((https:[^)]+)\)/)[1];
    const file = 'fonts/' + url.split('/').slice(-3).join('_');
    if (!existsSync(file)) writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
    appendFileSync('fonts/fonts.css', b.replace(/^latin \*\//, '').replace(url, file.replace('fonts/', '')).replace(/unicode-range[^;]+;/, ''));
    console.log('ok', fam, file);
  }
}
