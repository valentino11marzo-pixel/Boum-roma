import { writeFileSync } from 'node:fs';
import { T1 } from './t1.mjs'; import { T2 } from './t2.mjs'; import { T3 } from './t3.mjs';
import { loadChromium, launchOptions } from '../../tests/_browser.mjs';
const TS = [T1, T2, T3];
const sintesi = {
  1: ['Romano, minerale, inciso', 'Pianta di Nolli + targa di travertino', 'Il più unico a Roma'],
  2: ['Moderno, forte, misurato', 'Fascia arancio con i dati veri', 'Il più visibile per strada'],
  3: ['Sobrio, internazionale, di famiglia', 'Archi da una soglia, cerchi da un punto', 'Il più coerente con BOOM'],
};
const col = (t) => `<section><p class="k">TERRITORIO ${t.id} · ${t.arche.toUpperCase()}</p><h2>${t.nome}</h2>
<ul>${sintesi[t.id].map(s => `<li>${s}</li>`).join('')}</ul>
<div class="mini"><div class="sc">${t.web()}</div></div>
<div class="lg" style="${t.stageBg}">${t.logo('big')}</div>
<div class="strip">${t.palette.map(p => `<i style="background:${p.hex}" title="${p.name}"></i>`).join('')}</div>
<div class="app"><div class="ct">${t.cartello()}</div><div class="av">${t.symbol(72)}${t.symbol(40)}</div></div></section>`;
const html = `<!doctype html><html lang="it"><meta charset="utf-8"><link rel="stylesheet" href="fonts/fonts.css"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1860px;background:#ECEAE6;color:#1B1B1B;font:400 14px/1.45 'Inter Tight';padding:36px}
h1{font:700 40px/1 'Inter Tight';letter-spacing:-.02em}.sub{font:400 17px 'Inter Tight';color:#555;margin-top:8px}
.k{font:500 11px/1 'IBM Plex Mono';letter-spacing:.14em;color:#6B6B6B}
.cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:26px;margin-top:26px}section{min-width:0}
section h2{font:700 34px/1 'Inter Tight';letter-spacing:-.02em;margin:8px 0 10px}
section ul{list-style:none;font:400 15px/1.5 'Inter Tight';color:#333;margin-bottom:14px}section li::before{content:'— '}
.mini{width:100%;aspect-ratio:1370/640;overflow:hidden;border-radius:8px;position:relative}
.sc{position:absolute;left:0;top:0;width:1370px;height:640px;transform:scale(var(--s,.4175));transform-origin:0 0}
.lg{height:250px;border-radius:8px;margin-top:14px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.lg>div{transform:scale(.52);transform-origin:center;width:192%;flex:none;display:flex!important;justify-content:center}
.strip{display:flex;height:26px;margin-top:14px;border-radius:5px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}.strip i{flex:1}
.app{display:flex;gap:16px;margin-top:14px;align-items:center}
.ct{width:260px;height:330px;background:#CFCAC1;border-radius:8px;display:flex;align-items:center;justify-content:center}
.av{display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;flex:1;height:330px;background:#DCD8D1;border-radius:8px}
.qrb{width:40px;height:40px;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font:600 7px 'Inter Tight';letter-spacing:.1em}
${T1.css}${T2.css}${T3.css}
</style><h1>Tre territori di marca, a parità di condizioni</h1><p class="sub">Stessa frase, stesso sito, stesse applicazioni. Cambia tutto il resto: idea, logo, carattere, colore, rapporto con BOOM.</p>
<div class="cols">${TS.map(col).join('')}</div></html>`;
writeFileSync('confronto.html', html);
const c = await loadChromium(); const b = await c.launch(launchOptions());
const p = await (await b.newContext({ viewport: { width: 1860, height: 1000 } })).newPage();
await p.goto('file://' + process.cwd() + '/confronto.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
await p.screenshot({ path: 'confronto.jpg', type: 'jpeg', quality: 86, fullPage: true }); await b.close(); console.log('ok');
