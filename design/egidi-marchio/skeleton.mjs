// Tavola di un territorio: stessa impaginazione per i tre, così si confrontano a parità di condizioni.
export const COPY = {
  h1a: 'Prima i documenti.', h1b: 'Poi il prezzo.',
  lead: "Valentino Egidi Immobiliare segue vendite, acquisti e investimenti nel centro di Roma. Prima dell'incarico leggiamo le carte: se non tornano, lo sai prima del mercato. Per affittare c'è BOOM.",
  nav: ['Vendere', 'Comprare', 'Investire'],
};
export function board(t) {
  const sw = t.palette.map(p => `<div class="sw"><i style="background:${p.hex}${p.edge ? ';box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)' : ''}"></i><b>${p.name}</b><span>${p.hex} · ${p.role}</span></div>`).join('');
  const ty = t.type.map(x => `<div class="tyr"><span class="tyl">${x.role} · ${x.family}</span><div style="${x.css}">${x.sample}</div></div>`).join('');
  return `<!doctype html><html lang="it"><meta charset="utf-8"><link rel="stylesheet" href="fonts/fonts.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1800px;background:#ECEAE6;color:#1B1B1B;font:400 14px/1.45 'Inter Tight',sans-serif;padding:40px}
.k{font:500 11px/1 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#6B6B6B}
.top{display:grid;grid-template-columns:1fr 520px;gap:40px;align-items:end;padding-bottom:28px;border-bottom:1px solid #CFCBC4}
.top h1{font:700 64px/1 'Inter Tight';letter-spacing:-.02em;margin-top:10px}
.top .idea{font:400 22px/1.3 'Inter Tight';margin-top:12px;color:#333;max-width:900px}
.why{display:grid;gap:10px}.why p{font-size:13.5px;line-height:1.45}.why b{font:500 10.5px 'IBM Plex Mono';letter-spacing:.12em;text-transform:uppercase;display:block;color:#6B6B6B;margin-bottom:2px}
.g1{display:grid;grid-template-columns:1fr 360px;gap:20px;margin-top:28px}
.stage{border-radius:10px;min-height:440px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.stage .k{position:absolute;left:18px;top:16px}
.pal{display:grid;gap:10px;align-content:start}
.sw{display:grid;grid-template-columns:64px 1fr;grid-template-rows:auto auto;column-gap:12px;align-items:center}
.sw i{grid-row:1/3;width:64px;height:52px;border-radius:6px}.sw b{font:600 14px 'Inter Tight'}.sw span{font:400 11.5px 'IBM Plex Mono';color:#666}
.g2{display:grid;grid-template-columns:1fr 330px;gap:20px;margin-top:20px}
.web{border-radius:10px;overflow:hidden;height:640px;position:relative;box-shadow:0 1px 0 rgba(0,0,0,.08)}
.phone{border-radius:34px;overflow:hidden;height:640px;position:relative;border:9px solid #111;background:#111}
.g3{display:grid;grid-template-columns:300px 250px 1fr 1fr;gap:20px;margin-top:20px}
.cell{border-radius:10px;min-height:400px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
.cell>.k{position:absolute;left:16px;top:14px}
.av{background:#DCD8D1;flex-direction:column;gap:18px}
.wa{width:250px;padding:0 18px}.wa .row{display:flex;align-items:center;gap:10px;background:#fff;border-radius:10px;padding:9px 10px;margin-top:8px}
.wa .row p{font:600 13px 'Inter Tight';color:#111}.wa .row small{display:block;font:400 11.5px 'Inter Tight';color:#777}
.qrb{width:40px;height:40px;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font:600 7px 'Inter Tight';letter-spacing:.1em}
.ty{margin-top:20px;background:#fff;border-radius:10px;padding:26px 28px;display:grid;grid-template-columns:repeat(${t.type.length},1fr);gap:28px}
.tyl{display:block;font:500 10.5px 'IBM Plex Mono';letter-spacing:.12em;text-transform:uppercase;color:#777;margin-bottom:12px}
${t.css}
</style>
<div class="top"><div><p class="k">Territorio ${t.id} · ${t.arche}</p><h1>${t.nome}</h1><p class="idea">${t.idea}</p></div>
<div class="why"><p><b>Perché può vincere</b>${t.perche}</p><p><b>Rischio</b>${t.rischio}</p><p><b>Con BOOM</b>${t.boom}</p></div></div>
<div class="g1"><div class="stage" style="${t.stageBg}"><span class="k" style="color:${t.stageK || '#888'}">Logo</span>${t.logo('big')}</div><div class="pal"><p class="k">Colori</p>${sw}</div></div>
<div class="g2"><div class="web">${t.web()}</div><div class="phone">${t.phone()}</div></div>
<div class="g3">
 <div class="cell" style="background:#CFCAC1"><span class="k">Cartello vendesi</span>${t.cartello()}</div>
 <div class="cell av"><span class="k">WhatsApp</span>${t.symbol(96)}<div class="wa"><div class="row">${t.symbol(40)}<div><p>Valentino Egidi Immobiliare</p><small>Ho letto le carte di via Giulia…</small></div></div></div></div>
 <div class="cell" style="background:${t.cartaBg || '#D9D5CE'}"><span class="k">Biglietto · fascicolo</span>${t.carta()}</div>
 <div class="cell" style="background:#1A1A1A"><span class="k" style="color:#999">Con BOOM</span>${t.lockup()}</div>
</div>
<div class="ty">${ty}</div>
</html>`;
}
