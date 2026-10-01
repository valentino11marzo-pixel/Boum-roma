const ROOT = new URL('../../', import.meta.url).href;
import { COPY } from './skeleton.mjs'; import { archi } from './archi.mjs';
const C = { calce: '#F6F4EF', graf: '#1E1F21', pietra: '#D9D3C7', notte: '#060607', oro: '#FFD700' };
const IMG = `${ROOT}egidi/img/metodo-3.webp`;
const BM = `${ROOT}boom-mark.svg`;
const logo = (k = 1, col = C.graf) => `<div class="t3-lg" style="--k:${k};color:${col}">${archi({ size: 64 * k, stroke: col, sw: k < .7 ? 4.6 : 2.6, n: k < .7 ? 4 : 7 })}<div><b>Valentino Egidi</b><span>IMMOBILIARE · ROMA</span></div></div>`;
const boom = (k = 1) => `<div class="t3-lg" style="--k:${k};color:#fff"><img src="${BM}" style="width:${54 * k}px;height:${54 * k}px"><div><b style="letter-spacing:.06em">BOOM</b><span style="color:#bfb7a0">AFFITTI · ROMA</span></div></div>`;
const portale = (h, img = true) => { const w = h * 100 / 120; return `<div style="position:relative;width:${w}px;height:${h}px">${archi({ size: h, stroke: C.graf, sw: 1.6, n: 6 })}${img ? `<div style="position:absolute;left:${w * (50 - 84 * Math.pow(.78, 5) / 2) / 100}px;bottom:${h * 4 / 120}px;width:${w * 84 * Math.pow(.78, 5) / 100}px;height:${h * 108 * Math.pow(.78, 5) / 120}px;border-radius:999px 999px 0 0;overflow:hidden;background:url(${IMG}) center/cover"></div>` : ''}</div>`; };
export const T3 = {
  id: '3', arche: 'La famiglia', nome: 'La Porta',
  idea: "Una casa, due porte: si compra da Egidi, si affitta con BOOM. Stessa regola di disegno per i due marchi: BOOM sono cerchi che nascono da un punto, Egidi sono archi che nascono da una soglia. Il giorno e la notte della stessa macchina.",
  perche: "Racconta ciò che a Roma nessuno ha (la ricerca: nessuna coppia vendita + affitto internazionale documentata): compri la casa e la mettiamo a reddito. La parentela con BOOM si vede in un secondo. L'arco è l'invenzione costruttiva di Roma, qui astratto in un portale, non il Colosseo.",
  rischio: "È il più sobrio: la personalità di Valentino deve arrivare da foto e voce, perché il marchio da solo è quieto. Un'agenzia australiana (Domain) usa un arco verde come motivo: diverso, ma da tenere presente.",
  boom: "Casa unica di marchi: stesso carattere (Inter Tight, che toglie a BOOM la dipendenza dall'Helvetica del telefono), stessa costruzione, giorno e notte. L'oro resta solo a BOOM.",
  stageBg: `background:linear-gradient(90deg,${C.calce} 50%,${C.notte} 50%)`, stageK: '#999',
  palette: [
    { name: 'Calce', hex: C.calce, role: 'il giorno: Egidi', edge: 1 },
    { name: 'Grafite', hex: C.graf, role: 'testo, archi' },
    { name: 'Pietra', hex: C.pietra, role: 'secondario', edge: 1 },
    { name: 'Notte', hex: C.notte, role: 'la notte: BOOM' },
    { name: 'Oro', hex: C.oro, role: 'solo BOOM, solo su nero' },
  ],
  type: [
    { role: 'Un carattere per due marchi', family: 'Inter Tight 300 / 600', css: `font:300 46px/1.04 'Inter Tight';letter-spacing:-.02em;color:${C.graf}`, sample: 'Prima i documenti.<br><b style="font-weight:600">Poi il prezzo.</b>' },
    { role: 'Testo', family: 'Inter Tight 400', css: `font:400 18px/1.5 'Inter Tight';color:#333`, sample: COPY.lead },
    { role: 'Il tabellone', family: 'JetBrains Mono', css: `font:500 14px/1.9 'JetBrains Mono';color:#222`, sample: 'VENDERE ··········· APERTO<br>AFFITTARE ········ BOOM ↗' },
  ],
  css: `
.t3-lg{--k:1;display:inline-flex;align-items:center;gap:calc(18px*var(--k))}
.t3-lg b{display:block;font:300 calc(40px*var(--k))/1 'Inter Tight';letter-spacing:-.015em}
.t3-lg span{display:block;font:600 calc(10.5px*var(--k))/1 'Inter Tight';letter-spacing:.2em;margin-top:calc(9px*var(--k));opacity:.75}
.t3-web{position:absolute;inset:0;background:${C.calce};color:${C.graf};display:grid;grid-template-columns:1fr 560px}
.t3-nav{position:absolute;left:0;right:0;top:0;height:88px;display:flex;align-items:center;justify-content:space-between;padding:0 40px}
.t3-nav nav{display:flex;gap:28px;align-items:center;font:500 13.5px 'Inter Tight'}
.t3-nav nav b{display:flex;align-items:center;gap:8px;background:${C.notte};color:#fff;padding:8px 14px 8px 10px;border-radius:99px;font-weight:500;letter-spacing:.12em;font-size:12px}
.t3-nav nav b img{width:20px;height:20px}
.t3-l{padding:150px 0 0 48px}
.t3-h{font:300 76px/1.02 'Inter Tight';letter-spacing:-.025em}
.t3-p{font:400 18px/1.5 'Inter Tight';margin-top:22px;max-width:520px;color:#3b3c3e}
.t3-bd{margin-top:30px;width:520px;font:500 13px 'JetBrains Mono';letter-spacing:.06em}
.t3-bd div{display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid #cfcac0}
.t3-bd i{font-style:normal;background:${C.graf};color:#fff;padding:2px 7px}
.t3-bd i.bm{background:${C.notte};color:${C.oro}}
.t3-r{display:flex;align-items:flex-end;justify-content:center;padding-bottom:0}
.t3-ph{position:absolute;inset:0;background:${C.calce};color:${C.graf}}
.t3-cart{width:216px;height:300px;background:#fff;color:${C.graf};padding:18px 16px 14px;display:flex;flex-direction:column;align-items:center;box-shadow:0 12px 24px rgba(0,0,0,.2)}
.t3-cart .v{font:300 42px/1 'Inter Tight';letter-spacing:-.02em;margin-top:14px}
.t3-cards{position:relative;width:420px;height:280px}
.t3-card{position:absolute;width:330px;height:190px;box-shadow:0 10px 22px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}
.t3-card.f{left:0;top:0;background:${C.calce};width:300px;height:170px}.t3-card.b{right:0;bottom:0;background:${C.notte};width:300px;height:170px;align-items:flex-end;padding-bottom:26px}
.t3-lk{display:flex;flex-direction:column;align-items:center;gap:20px;padding:0 20px}
.fx{font:400 11.5px/1.5 'Inter Tight';color:#bbb;text-align:center;max-width:440px}
`,
  logo: () => `<div style="display:grid;grid-template-columns:1fr 1fr;width:100%;align-items:center;justify-items:center">${logo(1.25)}${boom(1.25)}</div>`,
  symbol: (s) => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${C.calce};display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)">${archi({ size: s * .62, stroke: C.graf, sw: s > 60 ? 2.6 : 5, n: s > 60 ? 7 : 4 })}</div>`,
  web: () => `<div class="t3-web"><div class="t3-nav">${logo(.5)}<nav><span>Vendere</span><span>Comprare</span><span>Investire</span><b><img src="${BM}">BOOM ↗</b></nav></div>
  <div class="t3-l"><h2 class="t3-h">Prima i documenti.<br>Poi il prezzo.</h2><p class="t3-p">${COPY.lead}</p><div class="t3-bd"><div><span>VENDERE</span><i>APERTO</i></div><div><span>COMPRARE</span><i>APERTO</i></div><div><span>INVESTIRE</span><i>APERTO</i></div><div><span>AFFITTARE</span><i class="bm">BOOM ↗</i></div></div></div>
  <div class="t3-r">${portale(560)}</div></div>`,
  phone: () => `<div class="t3-ph"><div style="padding:16px 18px;display:flex;justify-content:space-between;align-items:center">${logo(.34)}<span style="font:500 12px 'Inter Tight'">Menu</span></div><div style="display:flex;justify-content:center;margin-top:8px">${portale(250)}</div><h2 style="font:300 34px/1.04 'Inter Tight';letter-spacing:-.02em;padding:18px 18px 0">Prima i documenti.<br>Poi il prezzo.</h2><p style="font:400 14px/1.45 'Inter Tight';padding:12px 18px;color:#3b3c3e">Vendite, acquisti e investimenti nel centro di Roma.</p></div>`,
  cartello: () => `<div class="t3-cart">${archi({ size: 92, stroke: C.graf, sw: 2.4 })}<span class="v">Vendesi</span><span style="font:300 15px 'Inter Tight';margin-top:8px">Valentino Egidi</span><span style="font:600 7.5px 'Inter Tight';letter-spacing:.2em;opacity:.7;margin-top:4px">IMMOBILIARE · ROMA</span><div style="display:flex;justify-content:space-between;align-items:flex-end;width:100%;margin-top:auto"><span class="qrb" style="font:600 7px 'Inter Tight'">QR</span><span style="font:600 7px/1.4 'Inter Tight';letter-spacing:.12em;text-align:right">TELEFONO<br>DA CONFERMARE</span></div></div>`,
  carta: () => `<div class="t3-cards"><div class="t3-card b">${boom(.62)}</div><div class="t3-card f">${logo(.62)}</div></div>`,
  lockup: () => `<div class="t3-lk"><div style="display:flex;gap:30px;align-items:center">${logo(.5, '#F6F4EF')}<span style="width:1px;height:60px;background:#555"></span>${boom(.5)}</div><p class="fx">Stessa regola di disegno: cerchi da un punto, archi da una soglia.<br>BOOM è il marchio di Egidi Immobiliare S.r.l. per gli affitti a studenti e professionisti internazionali.</p></div>`,
};
