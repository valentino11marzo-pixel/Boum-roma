const ROOT = new URL('../../', import.meta.url).href;
import { nolli } from './nolli.mjs'; import { COPY } from './skeleton.mjs';
const C = { trav: '#E6DCC8', trav2: '#EFE8D9', bas: '#2B2926', pep: '#8C8578', verd: '#4E8B7A' };
const plan = (s, ink = C.bas, g = C.trav) => `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-hidden="true"><path fill="${ink}" fill-rule="evenodd" d="M12 17 L87 11 L91 88 L13 86Z M38 36 L65 34 L66 61 L39 62Z"/><path fill="${g}" d="M49.5 61.6 L55.5 61.3 L56.2 87.6 L50 87.4Z"/></svg>`;
const targa = (k = 1, tone = 'light') => `<div class="t1-pl ${tone}" style="--k:${k}"><div class="t1-in"><span class="t1-a">Valentino</span><span class="t1-n">EGIDI</span><span class="t1-b">IMMOBILIARE · ROMA</span></div></div>`;
export const T1 = {
  id: '1', arche: 'Il custode di Roma', nome: 'Il Rione',
  idea: "Chi conosce ogni palazzo del centro. Il marchio prende due oggetti civici di Roma che nessuna agenzia usa: la targa di travertino delle vie e la pianta di Nolli (1748), dove i palazzi sono neri e le strade bianche.",
  perche: "È l'unico dei tre impossibile da copiare fuori Roma. Colore chiaro e minerale dove il settore è scuro e saturo (la ricerca: rosso, blu e verde franchising sono presi). La pianta diventa un sistema: ogni casa in vendita ha la sua mappa figura-sfondo.",
  rischio: "Il maiuscolo inciso può scivolare nel \"classico di lusso\" se eseguito male. La targa di marmo è usata da qualche ristorante: la differenza la fa la pianta, non la targa.",
  boom: "Marchi separati, legati da una riga: BOOM resta nero e oro, Egidi è la pietra. Il nero della pianta di Nolli è lo stesso nero di BOOM: il ponte è lì.",
  stageBg: `background:${C.trav}`, stageK: '#8a7f6c', cartaBg: '#CFC6B4',
  palette: [
    { name: 'Travertino', hex: C.trav, role: 'fondo, calce opaca', edge: 1 },
    { name: 'Calce', hex: C.trav2, role: 'carta, targa', edge: 1 },
    { name: 'Basalto', hex: C.bas, role: 'testo, isolati' },
    { name: 'Peperino', hex: C.pep, role: 'secondario' },
    { name: 'Verderame', hex: C.verd, role: 'la casa giusta' },
  ],
  type: [
    { role: 'Marchio e titoli', family: 'Castoro Titling', css: `font:400 46px/1.02 'Castoro Titling';letter-spacing:.04em;color:${C.bas}`, sample: 'PRIMA I DOCUMENTI.<br>POI IL PREZZO.' },
    { role: 'Testo', family: 'Castoro', css: `font:400 19px/1.45 'Castoro';color:#333`, sample: COPY.lead },
    { role: 'Interfaccia e dati', family: 'Hanken Grotesk', css: `font:500 15px/1.6 'Hanken Grotesk';color:#333`, sample: 'Foglio 482 · Particella 117 · Sub 9<br><span style="letter-spacing:.12em;font-size:12px">VENDERE · COMPRARE · INVESTIRE</span>' },
  ],
  css: `
.t1-pl{--k:1;display:inline-block;padding:calc(10px*var(--k));background:linear-gradient(160deg,#F1EBDD,#E3D8C2 55%,#EAE2D2);box-shadow:0 calc(2px*var(--k)) calc(6px*var(--k)) rgba(60,45,20,.18),inset 0 0 0 1px rgba(80,65,40,.12)}
.t1-pl.dark{background:linear-gradient(160deg,#ECE4D3,#DED2BA)}
.t1-in{display:flex;flex-direction:column;align-items:center;padding:calc(12px*var(--k)) calc(30px*var(--k)) calc(11px*var(--k));border:calc(1.6px*var(--k)) solid ${C.bas};outline:calc(1px*var(--k)) solid ${C.bas};outline-offset:calc(4px*var(--k));color:${C.bas}}
.t1-a{font:400 calc(15px*var(--k))/1 'Castoro';font-style:italic;letter-spacing:.02em}
.t1-n{font:400 calc(64px*var(--k))/1 'Castoro Titling';letter-spacing:.12em;margin:calc(6px*var(--k)) 0 calc(5px*var(--k)) calc(.12em);text-shadow:0 1px 0 rgba(255,255,255,.55),0 -1px 0 rgba(0,0,0,.18)}
.t1-b{font:600 calc(9.5px*var(--k))/1 'Hanken Grotesk';letter-spacing:.32em;margin-left:.32em}
.t1-web{position:absolute;inset:0;background:${C.trav};display:grid;grid-template-columns:600px 1fr}
.t1-nav{position:absolute;left:0;right:0;top:0;height:86px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;z-index:2;background:${C.trav};border-bottom:1px solid rgba(43,41,38,.22)}
.t1-nav nav{display:flex;gap:28px;font:600 12px 'Hanken Grotesk';letter-spacing:.16em;color:${C.bas}}
.t1-nav nav b{font-weight:600;padding:8px 12px;background:#060607;color:#FFD700;letter-spacing:.2em}
.t1-l{padding:150px 40px 0 48px;color:${C.bas}}
.t1-kick{font:600 11px 'Hanken Grotesk';letter-spacing:.24em;color:#7d725f}
.t1-h{font:400 58px/1.04 'Castoro Titling';letter-spacing:.03em;margin-top:22px}
.t1-p{font:400 18px/1.5 'Castoro';margin-top:22px;color:#3a3631;max-width:470px}
.t1-cta{display:flex;gap:22px;align-items:center;margin-top:30px;font:600 12.5px 'Hanken Grotesk';letter-spacing:.14em}
.t1-cta span:first-child{background:${C.bas};color:${C.trav2};padding:15px 22px}
.t1-cta span:last-child{border-bottom:1px solid ${C.bas};padding-bottom:3px}
.t1-r{position:relative;border-left:1px solid rgba(43,41,38,.25);margin-top:86px}
.t1-cap{position:absolute;left:18px;bottom:16px;font:500 10.5px 'Hanken Grotesk';letter-spacing:.14em;color:${C.bas};background:${C.trav};padding:6px 9px}
.t1-tag{position:absolute;font:600 10px 'Hanken Grotesk';letter-spacing:.18em;background:${C.trav2};color:${C.bas};padding:6px 9px;box-shadow:0 1px 0 rgba(0,0,0,.15)}
.t1-ph{position:absolute;inset:0;background:${C.trav};display:flex;flex-direction:column}
.t1-ph .m{height:270px;position:relative}
.t1-ph .x{padding:22px 22px}
.t1-cart{width:216px;height:300px;background:linear-gradient(165deg,#F0E9DA,#E0D4BC);box-shadow:0 12px 24px rgba(40,30,15,.25);padding:12px}
.t1-cart>div{height:100%;border:1.5px solid ${C.bas};outline:1px solid ${C.bas};outline-offset:3px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:20px 10px 14px;color:${C.bas}}
.t1-cart .v{font:400 31px/1 'Castoro Titling';letter-spacing:.06em}
.t1-cart small{font:600 8px 'Hanken Grotesk';letter-spacing:.24em;text-align:center;line-height:1.7}
.qrb{width:40px;height:40px;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font:600 7px 'Hanken Grotesk';letter-spacing:.1em}
.t1-cards{position:relative;width:420px;height:280px}
.t1-card{position:absolute;width:330px;height:190px;box-shadow:0 10px 22px rgba(40,30,15,.22)}
.t1-card.f{left:0;top:0;background:linear-gradient(160deg,#F2ECDF,#E4D9C4);display:flex;align-items:center;justify-content:center}
.t1-card.b{right:0;bottom:0;overflow:hidden}
.t1-card.b em{position:absolute;left:12px;bottom:10px;font:600 8.5px 'Hanken Grotesk';font-style:normal;letter-spacing:.2em;background:${C.trav};color:${C.bas};padding:5px 7px}
.t1-lk{display:flex;flex-direction:column;align-items:center;gap:22px;padding:0 24px}
.t1-lk .row{display:flex;align-items:center;gap:26px}
.bmw{display:flex;align-items:center;gap:10px;color:#fff;font:300 22px/1 'Inter Tight';letter-spacing:.32em}
.bmw img{width:38px;height:38px}
.fx{font:400 11.5px/1.5 'Hanken Grotesk';color:#BDB6A8;text-align:center;max-width:430px}
`,
  logo: () => `<div style="display:flex;align-items:center;gap:70px">${targa(1.35)}<div style="display:flex;flex-direction:column;align-items:center;gap:14px">${plan(150)}<span style="font:600 10px 'Hanken Grotesk';letter-spacing:.2em;color:#7d725f">SIMBOLO · LA PIANTA DEL PALAZZO</span></div></div>`,
  symbol: (s) => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${C.trav};display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)">${plan(s * .62)}</div>`,
  web: () => `<div class="t1-web"><div class="t1-nav">${targa(.42)}<nav><span>VENDERE</span><span>COMPRARE</span><span>INVESTIRE</span><b>AFFITTARE · BOOM ↗</b></nav></div>
  <div class="t1-l"><p class="t1-kick">STUDIO IN VIA DEI CORONARI · CENTRO STORICO</p><h2 class="t1-h">PRIMA I<br>DOCUMENTI.<br>POI IL PREZZO.</h2><p class="t1-p">${COPY.lead}</p><div class="t1-cta"><span>SCRIVI A VALENTINO</span><span>COME LEGGIAMO LE CARTE</span></div></div>
  <div class="t1-r">${nolli({ W: 770, H: 554, cw: 64, ch: 54, street: 6, seed: 3, hi: [7, 5], piazza: [360, 300, 70, 210, 8], fiume: true })}<span class="t1-tag" style="left:470px;top:262px">IN VENDITA · VERIFICATA</span><span class="t1-cap">PIANTA STILIZZATA ALLA MANIERA DI NOLLI (1748) · NON È LA MAPPA REALE</span></div></div>`,
  phone: () => `<div class="t1-ph"><div style="padding:16px 18px;display:flex;justify-content:space-between;align-items:center">${targa(.3)}<span style="font:600 10px 'Hanken Grotesk';letter-spacing:.18em;color:${C.bas}">MENU</span></div><div class="m">${nolli({ W: 320, H: 270, cw: 50, ch: 42, street: 4.5, seed: 3, hi: [4, 3], piazza: [150, 140, 34, 110, 8], fiume: true })}</div><div class="x"><h2 style="font:400 31px/1.06 'Castoro Titling';color:${C.bas};letter-spacing:.03em">PRIMA I DOCUMENTI. POI IL PREZZO.</h2><p style="font:400 14px/1.45 'Castoro';color:#3a3631;margin-top:12px">Vendite, acquisti e investimenti nel centro di Roma.</p><p style="margin-top:18px;display:inline-block;background:${C.bas};color:${C.trav2};font:600 11px 'Hanken Grotesk';letter-spacing:.14em;padding:12px 16px">SCRIVI A VALENTINO</p></div></div>`,
  cartello: () => `<div class="t1-cart"><div><span class="v">VENDESI</span>${plan(58)}<small>VALENTINO EGIDI<br>IMMOBILIARE</small><div style="display:flex;justify-content:space-between;width:100%;align-items:flex-end"><span class="qrb">QR</span><small style="text-align:right">TELEFONO<br>DA CONFERMARE</small></div></div></div>`,
  carta: () => `<div class="t1-cards"><div class="t1-card b">${nolli({ W: 330, H: 190, cw: 42, ch: 36, street: 3.8, seed: 3, hi: [5, 3], piazza: [150, 95, 26, 80, 8], fiume: true })}<em>LA CASA, NEL SUO RIONE</em></div><div class="t1-card f">${targa(.62)}</div></div>`,
  lockup: () => `<div class="t1-lk"><div class="row">${targa(.55)}<span style="width:1px;height:70px;background:#555"></span><div class="bmw"><img src="${ROOT}boom-mark.svg" alt="">BOOM</div></div><p class="fx">BOOM è il marchio di Egidi Immobiliare S.r.l. per gli affitti a studenti e professionisti internazionali.</p></div>`,
};
