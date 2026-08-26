// api/_pdfbrand.js — LA TESTATA DEI DOCUMENTI BOOM, IN UNA COPIA SOLA.
//
// Ogni PDF del sistema (verbale, inventario, fascicolo, rendiconto…) si
// disegnava la propria intestazione a mano: rettangolo nero, la parola
// "BOOM" scritta come testo, e le due righe Egidi ricopiate in fondo. Sei
// copie della stessa cosa, quindi sei versioni leggermente diverse — e il
// MARCHIO vero non compariva da nessuna parte: un documento che va all'AdE,
// al CAF o al proprietario si presentava con una scritta, non con un logo.
//
// Qui c'è una testata sola: il marchio VERO (i cerchi sonori oro,
// rasterizzati una volta da boom-mark.svg e incorporati in base64 — zero
// dipendenze a runtime, zero rete, nessun file da spedire con la funzione),
// la parola BOOM con la spaziatura larga del brand, e il piede legale.
//
// Sul tipo di carattere: la Helvetica dei PDF NON è un ripiego, è
// esattamente il font del sito (--sans: 'Helvetica Neue'). Un typeface
// personalizzato vorrebbe @pdf-lib/fontkit più un file .ttf licenziato da
// spedire dentro ogni funzione; la differenza la fa la TIPOGRAFIA — pesi,
// spaziatura, gerarchia — non un secondo font.
//
// pdf-lib è importato staticamente: un await import() lazy non viene
// tracciato dal bundler Vercel e a runtime non si trova (la lezione del
// 22 luglio 2026).

import { rgb, StandardFonts } from 'pdf-lib';

// Il marchio BOOM (cerchi sonori, gradiente oro su trasparente), 180px.
// Rigenerabile: sharp(boom-mark.svg,{density:900}).trim().resize(180)
export const MARK_PNG_B64 = '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';

// I colori del brand, gli stessi token del sito (--gold #D4AF37 su carta
// diventa leggermente più caldo per non sparire in stampa).
export const INK = rgb(0.08, 0.08, 0.09);
export const GREY = rgb(0.42, 0.42, 0.45);
export const FAINT = rgb(0.62, 0.60, 0.58);
export const GOLD = rgb(0.72, 0.55, 0.05);
export const GOLD_LIGHT = rgb(0.91, 0.78, 0.41);
export const HAIR = rgb(0.75, 0.73, 0.68);
export const WHITE = rgb(1, 1, 1);
export const BLACK = rgb(0.04, 0.04, 0.05);
export const RED = rgb(0.66, 0.16, 0.13);

// WinAnsi: StandardFonts non conosce nient'altro, e un carattere fuori
// tabella non degrada — LANCIA, uccidendo il documento intero (la lezione
// del certificato FES, dove una freccia "→" bloccava ogni generazione).
export function wa(s) {
  return String(s == null ? '' : s)
    .replace(/[→➔➡]/g, '->').replace(/[✓✔☑☒]/g, 'X').replace(/−/g, '-')
    // – — ' ' " " … € NON si toccano: stanno in WinAnsi e sono la
    // punteggiatura vera dei nostri testi. Si tolgono solo i caratteri che
    // il font NON conosce — e che non degradano: fanno fallire il documento.
    .replace(/[^\x20-\xFF–—‘’“”…€]/g, '');
}

// Font + marchio, caricati una volta per documento. Il marchio è
// best-effort: un PDF senza logo è un PDF; un PDF che non nasce, no.
export async function brandAssets(pdf) {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let mark = null;
  try { mark = await pdf.embedPng(Buffer.from(MARK_PNG_B64, 'base64')); }
  catch (e) { console.warn('[pdfbrand] marchio non incorporato:', e.message); }
  return { font, bold, mark };
}

/**
 * La testata scura in cima alla pagina. Ritorna la y da cui scrivere.
 * @param page  pagina pdf-lib
 * @param b     { font, bold, mark } da brandAssets
 * @param o     { W, H, M, title, date }
 */
export function masthead(page, b, o) {
  const { W, H, M } = o;
  const BAND = 46;
  page.drawRectangle({ x: 0, y: H - BAND, width: W, height: BAND, color: BLACK });
  // filo d'oro sotto la banda: la stessa hairline delle pagine del sito
  page.drawRectangle({ x: 0, y: H - BAND - 0.8, width: W, height: 0.8, color: GOLD });

  let x = M;
  if (b.mark) {
    const s = 24;
    page.drawImage(b.mark, { x, y: H - BAND + (BAND - s) / 2, width: s, height: s });
    x += s + 11;
  }
  page.drawText('BOOM', { x, y: H - 29, size: 15, font: b.bold, color: WHITE, characterSpacing: 5 });
  page.drawText('ROMA', { x: x + 1, y: H - 40, size: 6.5, font: b.font, color: GOLD_LIGHT, characterSpacing: 3.6 });

  if (o.title) {
    const t = wa(o.title).toUpperCase();
    const tw = b.font.widthOfTextAtSize(t, 7.5) + t.length * 1.6;
    page.drawText(t, { x: W - M - tw, y: H - 25, size: 7.5, font: b.font, color: rgb(0.8, 0.8, 0.8), characterSpacing: 1.6 });
  }
  if (o.date) {
    const d = wa(o.date);
    page.drawText(d, { x: W - M - b.font.widthOfTextAtSize(d, 7.5), y: H - 36, size: 7.5, font: b.font, color: rgb(0.55, 0.55, 0.55) });
  }
  return H - BAND - 26;
}

// Il piede legale — due righe, un posto solo. `n/tot` si stampa solo quando
// il documento ha più di una pagina (su un foglio unico è rumore).
export function footer(page, b, o) {
  const { W, M } = o;
  page.drawText(wa('BOOM® è un marchio dell\'Unione europea registrato (MUE 019317594) di Egidi Immobiliare S.r.l.'),
    { x: M, y: 44, size: 7, font: b.font, color: GREY });
  page.drawText(wa('Egidi Immobiliare S.r.l. — Via dei Coronari 181/184, 00186 Roma — Sede legale: Viale Liegi 42, 00198 Roma — P.IVA 17322991005 — boomrome.com'),
    { x: M, y: 34, size: 6.5, font: b.font, color: GREY });
  if (o.pageNo && o.pages > 1) {
    const t = wa(`${o.pageNo} / ${o.pages}`);
    page.drawText(t, { x: W - M - b.font.widthOfTextAtSize(t, 7), y: 44, size: 7, font: b.font, color: FAINT });
  }
}

// Il piede su TUTTE le pagine, chiamato alla fine — solo qui si sa quante
// sono. Un documento numerato "1/1" su tre fogli è peggio che non numerato.
export function stampFooters(pdf, b, o) {
  const pages = pdf.getPages();
  pages.forEach((pg, i) => footer(pg, b, { ...o, pageNo: i + 1, pages: pages.length }));
}
