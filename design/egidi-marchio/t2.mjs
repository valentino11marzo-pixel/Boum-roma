const ROOT = new URL('../../', import.meta.url).href;
import { COPY } from './skeleton.mjs';
const C = { calce: '#F5F3EE', nero: '#141414', ar: '#FF6A00', grigio: '#8E8A84', carta: '#FFFFFF' };
const DATI = 'ESEMPIO — IMMOBILE N° 014 · FOGLIO 482 · PARTICELLA 117 · SUB 9 · 87,4 MQ IN VISURA · 91,0 MQ MISURATI · UN TRAMEZZO NON È IN PLANIMETRIA → SI SANA PRIMA DEL PREZZO · ';
const logo = (k = 1, inv = false) => `<div class="t2-lg${inv ? ' inv' : ''}" style="--k:${k}"><span class="a">VALENTINO</span><span class="n">EGIDI</span><span class="b">IMMOBILIARE · ROMA</span></div>`;
const E = (s, bg = C.ar, fg = C.nero) => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center"><span style="font:900 ${s * .5}px/1 'Anybody';font-stretch:150%;color:${fg};margin-top:${s * .02}px">E</span></div>`;
export const T2 = {
  id: '2', arche: 'Il perito', nome: 'La Fascia',
  idea: "L'agenzia che misura prima di vendere. Modernismo italiano (Noorda, Olivetti, Solari): un sistema rigoroso e un gesto solo. Il gesto è una fascia arancio che porta i dati veri della casa, come la fascia delle stazioni della metropolitana di Milano porta il nome.",
  perche: "È il più visibile per strada: un cartello arancio e nero si legge a 50 metri, i cartelli della concorrenza no. Il grottesco largo è un territorio libero a Roma (la ricerca: nessuno lo usa). Trasforma la tesi \"prima i documenti\" in un oggetto, non in uno slogan.",
  rischio: "Un colore pieno e forte può sembrare \"franchising\" se eseguito con poca disciplina. L'arancio va tenuto lontano dal rosso: mai più scuro di così. È il più freddo dei tre verso un proprietario anziano.",
  boom: "Famiglia per contrasto: BOOM nero e oro, Egidi bianco e arancio, lo stesso tabellone e la stessa fascia di dati. Due colori caldi, due marchi.",
  stageBg: `background:${C.calce}`, stageK: '#999',
  palette: [
    { name: 'Calce', hex: C.calce, role: 'fondo', edge: 1 },
    { name: 'Nero', hex: C.nero, role: 'testo, marchio' },
    { name: 'Arancio segnale', hex: C.ar, role: 'la fascia, mai testo su chiaro' },
    { name: 'Peperino', hex: C.grigio, role: 'secondario' },
    { name: 'Bianco', hex: C.carta, role: 'schede, carta', edge: 1 },
  ],
  type: [
    { role: 'Marchio e titoli', family: 'Anybody, larghezza 130–150', css: `font:850 44px/1 'Anybody';font-stretch:130%;color:${C.nero}`, sample: 'PRIMA I<br>DOCUMENTI.' },
    { role: 'Testo', family: 'Inter Tight', css: `font:400 18px/1.5 'Inter Tight';color:#333`, sample: COPY.lead },
    { role: 'Dati della fascia', family: 'Martian Mono', css: `font:500 14px/1.7 'Martian Mono';font-stretch:90%;color:#222`, sample: 'FG 482 · PART 117 · SUB 9<br>87,4 MQ VISURA · 91,0 MQ MISURATI' },
  ],
  css: `
.t2-lg{--k:1;display:inline-flex;flex-direction:column;align-items:flex-start;color:${C.nero}}
.t2-lg .a{font:800 calc(17px*var(--k))/1 'Anybody';font-stretch:150%;letter-spacing:.04em;margin-left:calc(2px*var(--k))}
.t2-lg .n{font:900 calc(96px*var(--k))/.8 'Anybody';font-stretch:150%;letter-spacing:-.01em;background:${C.ar};padding:calc(10px*var(--k)) calc(16px*var(--k)) calc(6px*var(--k));margin:calc(7px*var(--k)) 0}
.t2-lg .b{font:500 calc(10.5px*var(--k))/1 'Martian Mono';letter-spacing:.14em;margin-left:calc(2px*var(--k))}
.t2-lg.inv{color:#fff}.t2-lg.inv .n{color:${C.nero}}
.t2-web{position:absolute;inset:0;background:${C.calce};color:${C.nero}}
.t2-nav{height:92px;display:flex;align-items:center;justify-content:space-between;padding:0 40px}
.t2-nav nav{display:flex;gap:26px;font:700 12px 'Anybody';font-stretch:115%;letter-spacing:.08em}
.t2-nav nav b{background:#060607;color:#FFD700;padding:9px 13px;font-weight:700}
.t2-h{font:850 78px/.92 'Anybody';font-stretch:126%;letter-spacing:-.01em;padding:34px 40px 0}
.t2-band{position:absolute;left:0;right:0;top:318px;height:58px;background:${C.ar};display:flex;align-items:center;overflow:hidden;white-space:nowrap;font:600 15px 'Martian Mono';font-stretch:88%;letter-spacing:.04em}
.t2-row{position:absolute;left:40px;top:420px;display:grid;grid-template-columns:repeat(3,250px);gap:26px}
.t2-row div{border-top:3px solid ${C.nero};padding-top:12px}
.t2-row b{display:block;font:900 30px/1 'Anybody';font-stretch:140%}
.t2-row p{font:400 14.5px/1.45 'Inter Tight';margin-top:8px;color:#333}
.t2-sc{position:absolute;right:40px;top:400px;width:400px;background:#fff;box-shadow:0 18px 40px rgba(0,0,0,.12);font:500 12.5px 'Martian Mono';font-stretch:90%}
.t2-sc header{background:${C.nero};color:#fff;padding:12px 16px;display:flex;justify-content:space-between;letter-spacing:.08em;font-size:11px}
.t2-sc li{list-style:none;display:flex;justify-content:space-between;padding:8px 16px;border-bottom:1px solid #eee}
.t2-sc li i{font-style:normal;font-weight:700}
.ok{color:#1d7a46}.no{background:${C.ar};color:${C.nero};padding:0 6px}
.t2-ph{position:absolute;inset:0;background:${C.calce};color:${C.nero}}
.t2-cart{width:216px;height:300px;background:${C.ar};color:${C.nero};padding:18px 16px 14px;display:flex;flex-direction:column;box-shadow:0 12px 24px rgba(0,0,0,.25)}
.t2-cart .v{font:900 33px/.86 'Anybody';font-stretch:96%;margin-top:auto}
.t2-cart .d{background:#fff;font:600 9px/1.4 'Martian Mono';padding:7px 8px;margin:12px -16px 0;letter-spacing:.04em}
.t2-cards{position:relative;width:420px;height:280px}
.t2-card{position:absolute;width:330px;height:190px;box-shadow:0 10px 22px rgba(0,0,0,.2)}
.t2-card.f{left:0;top:0;background:#fff;display:flex;align-items:center;padding-left:26px}
.t2-card.b{right:0;bottom:0;background:${C.ar};padding:20px;font:600 10px/1.6 'Martian Mono';letter-spacing:.06em;color:${C.nero};display:flex;flex-direction:column;justify-content:flex-end}
.t2-lk{display:flex;flex-direction:column;align-items:center;gap:22px;padding:0 24px}
.t2-lk .row{display:flex;align-items:center;gap:26px}
.bmw{display:flex;align-items:center;gap:10px;color:#fff;font:300 22px/1 'Inter Tight';letter-spacing:.32em}
.bmw img{width:38px;height:38px}
.fx{font:400 11.5px/1.5 'Inter Tight';color:#bbb;text-align:center;max-width:430px}
`,
  logo: () => `<div style="display:flex;align-items:center;gap:80px">${logo(1.25)}<div style="display:flex;flex-direction:column;align-items:center;gap:14px">${E(150)}<span style="font:500 10px 'Martian Mono';letter-spacing:.14em;color:#888">SIMBOLO · LA E SULLA FASCIA</span></div></div>`,
  symbol: (s) => E(s),
  web: () => `<div class="t2-web"><div class="t2-nav">${logo(.36)}<nav><span>VENDERE</span><span>COMPRARE</span><span>INVESTIRE</span><b>AFFITTARE · BOOM ↗</b></nav></div>
  <h2 class="t2-h">PRIMA I DOCUMENTI.<br>POI IL PREZZO.</h2>
  <div class="t2-band"><span style="padding-left:40px">${DATI}${DATI}</span></div>
  <div class="t2-row"><div><b>01</b><p>Leggiamo visura, planimetria e conformità prima dell'incarico.</p></div><div><b>02</b><p>Il prezzo arriva dopo le carte, non prima.</p></div><div><b>03</b><p>Sul mercato va una casa che regge fino al rogito.</p></div></div>
  <div class="t2-sc"><header><span>SCHEDA · ESEMPIO</span><span>N° 014</span></header><ul><li>Visura catastale <i class="ok">✓</i></li><li>Planimetria = stato reale <i class="no">NO</i></li><li>Conformità urbanistica <i>IN VERIFICA</i></li><li>APE <i class="ok">✓</i></li><li>Prezzo <i>DOPO LE CARTE</i></li></ul></div></div>`,
  phone: () => `<div class="t2-ph"><div style="padding:16px 18px;display:flex;justify-content:space-between;align-items:center">${logo(.24)}<span style="font:700 10px 'Anybody';font-stretch:115%;letter-spacing:.1em">MENU</span></div><h2 style="font:850 30px/.94 'Anybody';font-stretch:112%;padding:24px 18px 0">PRIMA I DOCUMENTI.<br>POI IL PREZZO.</h2><div style="margin-top:22px;height:46px;background:${C.ar};display:flex;align-items:center;overflow:hidden;white-space:nowrap;font:600 11.5px 'Martian Mono';font-stretch:88%;padding-left:18px">${DATI}</div><p style="font:400 14px/1.45 'Inter Tight';padding:18px;color:#333">Vendite, acquisti e investimenti nel centro di Roma.</p><p style="margin:0 18px;display:inline-block;background:${C.nero};color:#fff;font:700 11px 'Anybody';font-stretch:115%;letter-spacing:.1em;padding:13px 16px">SCRIVI A VALENTINO</p></div>`,
  cartello: () => `<div class="t2-cart">${logo(.3)}<span class="v">VENDESI</span><div class="d">87 MQ · CARTE VERIFICATE · ESEMPIO</div><div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px"><span class="qrb" style="border-color:${C.nero};font:700 7px 'Martian Mono'">QR</span><span style="font:600 7.5px/1.4 'Martian Mono';text-align:right">TELEFONO<br>DA CONFERMARE</span></div></div>`,
  carta: () => `<div class="t2-cards"><div class="t2-card b">LA SCHEDA DELLA TUA CASA<br>FOGLIO · PARTICELLA · SUB<br>MQ IN VISURA · MQ MISURATI</div><div class="t2-card f">${logo(.5)}</div></div>`,
  lockup: () => `<div class="t2-lk"><div class="row">${logo(.4, true)}<span style="width:1px;height:70px;background:#555"></span><div class="bmw"><img src="${ROOT}boom-mark.svg" alt="">BOOM</div></div><p class="fx">BOOM è il marchio di Egidi Immobiliare S.r.l. per gli affitti a studenti e professionisti internazionali.</p></div>`,
};
