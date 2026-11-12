// api/owners/_incarico-pdf.js — IL DOCUMENTO DELL'INCARICO DEL PROPRIETARIO.
//
// Lo stesso foglio per l'anteprima (prima della firma: «da firmare») e per
// la copia firmata. Design dei documenti BOOM (_pdfbrand: marchio vero, filo
// d'oro, piede legale). Il testo NON vive qui: parti, scheda e clausole
// escono da js/incarico-engine.js, la stessa copia che la pagina mostra.
//
// pdf-lib importato staticamente (la lezione del 22 luglio 2026). Tutto il
// testo passa da wa(): un carattere fuori WinAnsi non degrada, UCCIDE il
// documento.
import { PDFDocument } from 'pdf-lib';
import { brandAssets, masthead, stampFooters, wa, INK, GREY, GOLD, HAIR } from '../_pdfbrand.js';
import INC from '../../js/incarico-engine.js';

const W = 595.28, H = 841.89, M = 56;
const TW = W - M * 2;

const itDateTime = (iso) => {
  try {
    const d = new Date(iso);
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    const g = (t) => (p.find(x => x.type === t) || {}).value || '';
    return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')} (ora di Roma)`;
  } catch (_) { return String(iso || ''); }
};

/**
 * @param {object} o { terms, ref, signature?, hash }
 *   signature: { at, ip, ua, name, png (Buffer) } — assente = anteprima
 * @returns {Promise<Buffer>}
 */
export async function buildIncaricoPdf({ terms, ref, signature, hash }) {
  const t = terms, sig = signature || null;
  const pdf = await PDFDocument.create();
  const b = await brandAssets(pdf);
  const title = 'Incarico di assistenza alla locazione';
  const date = INC.dateIt((sig && sig.at ? sig.at : new Date().toISOString()).slice(0, 10));
  let page = pdf.addPage([W, H]);
  let y = masthead(page, b, { W, H, M, title, date });

  const need = (h) => { if (y - h < 80) { page = pdf.addPage([W, H]); y = masthead(page, b, { W, H, M, title, date }); } };
  const line = (s, size = 9.5, font = b.font, color = INK, dy = size + 4) => { need(dy); page.drawText(wa(s), { x: M, y, size, font, color }); y -= dy; };
  const wrap = (s, size, font, width) => {
    const words = wa(s).split(/\s+/).filter(Boolean), lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) > width) { if (cur) lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const para = (s, size = 9.5, font = b.font, color = INK, lh = size * 1.48, x = M, width = TW) => {
    for (const l of wrap(s, size, font, width)) { need(lh); page.drawText(l, { x, y, size, font, color }); y -= lh; }
  };
  const rule = () => { need(12); page.drawRectangle({ x: M, y: y + 4, width: TW, height: 0.6, color: HAIR }); y -= 10; };
  const kv = (k, v) => {
    const lines = wrap(String(v == null || v === '' ? '-' : v), 9.5, b.font, TW - 130);
    need(14 * lines.length);
    page.drawText(wa(k), { x: M, y, size: 8.5, font: b.font, color: GREY });
    for (const l of lines) { page.drawText(l, { x: M + 130, y, size: 9.5, font: b.font, color: INK }); y -= 14; }
  };

  line('INCARICO DI ASSISTENZA ALLA LOCAZIONE', 13, b.bold, INK, 20);
  line(`Rif. ${ref || '-'}${sig ? '' : ' - copia da firmare'}`, 8.5, b.font, GREY, 16);
  rule();

  const p = INC.parties(t);
  line('TRA', 8, b.bold, GOLD, 13);
  para(p.boom + ';', 9.2);
  y -= 4;
  para(p.owner + '.', 9.2);
  y -= 8;

  line('IN SINTESI', 8, b.bold, GOLD, 13);
  for (const [k, v] of INC.summary(t)) kv(k, v);
  y -= 6;
  rule();

  line('SI CONVIENE QUANTO SEGUE', 8, b.bold, GOLD, 15);
  for (const c of INC.clauses(t)) {
    need(30);
    page.drawText(wa(`${c.n}. ${c.title}`), { x: M, y, size: 9.5, font: b.bold, color: INK });
    y -= 13.5;
    para(c.text, 9.2, b.font, INK, 13.4);
    y -= 5;
  }
  const spec = INC.clauses(t).filter(c => c.specific);
  if (spec.length) {
    y -= 2;
    para(`Ai sensi degli artt. 1341 e 1342 c.c. la Proprietà approva specificamente le clausole: ${spec.map(c => `${c.n} (${c.title})`).join(', ')}.`, 8.8, b.font, INK, 12.8);
  }
  y -= 6;
  rule();

  if (sig) {
    line('LA FIRMA', 8, b.bold, GOLD, 13);
    para(`Firmato digitalmente dalla Proprietà il ${itDateTime(sig.at)} dal proprio link personale (boomrome.com/incarico), dopo aver letto la scheda e il testo integrale e aver approvato a parte le clausole indicate sopra.`, 8.6, b.font, INK, 12.6);
    y -= 2;
    if (sig.png) {
      try {
        const img = await pdf.embedPng(sig.png);
        const h = 54, w = Math.min(200, img.width * (h / img.height));
        need(h + 22);
        page.drawImage(img, { x: M, y: y - h, width: w, height: h });
        y -= h + 4;
        page.drawRectangle({ x: M, y, width: 220, height: 0.6, color: INK });
        y -= 11;
      } catch (e) { console.warn('[incarico-pdf] firma non incorporata:', e.message); }
    }
    line(`La Proprietà - ${t.owner.kind === 'persona' ? t.owner.name : `${t.owner.name}, firma di ${sig.name || '-'}`}`, 8.5, b.font, GREY, 16);
    kv('Indirizzo IP', sig.ip || '-');
    kv('Dispositivo', String(sig.ua || '-').slice(0, 90));
    kv('Impronta (SHA-256)', String(hash || '-'));
    if (INC.hasWithdrawal(t)) kv('Avvio immediato', sig.immediateStart ? 'richiesto dalla Proprietà' : 'non richiesto');
    y -= 4;
    para(`Per ${INC.BOOM.name}: ${INC.BOOM.rep}, Amministratore Unico. L'incarico è predisposto e inviato da BOOM, che con l'invio lo sottoscrive.`, 8.6, b.font, INK, 12.6);
  } else {
    line('FIRME', 8, b.bold, GOLD, 13);
    y -= 34;
    need(30);
    page.drawRectangle({ x: M, y, width: 210, height: 0.6, color: INK });
    page.drawRectangle({ x: W - M - 210, y, width: 210, height: 0.6, color: INK });
    y -= 11;
    page.drawText(wa(`La Proprietà - ${t.owner.name}`), { x: M, y, size: 8.5, font: b.font, color: GREY });
    page.drawText(wa(`Per ${INC.BOOM.name} - ${INC.BOOM.rep}`), { x: W - M - 210, y, size: 8.5, font: b.font, color: GREY });
    y -= 16;
    kv('Impronta (SHA-256)', String(hash || '-'));
  }

  stampFooters(pdf, b, { W, M });
  return Buffer.from(await pdf.save());
}
