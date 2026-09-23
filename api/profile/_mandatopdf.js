// api/profile/_mandatopdf.js — IL DOCUMENTO DEL MANDATO DEL PROPRIETARIO.
//
// Il conduttore ha il suo documento (la proposta accettata, ristampata col
// testo del mandato: preagreement/_pdf.js → mandato-conduttore.pdf). Il
// proprietario non ha una proposta da firmare: il suo mandato nasce sulla
// Scheda, con un tap, e il documento che lo prova va costruito qui — un
// foglio solo, nel design dei documenti BOOM (_pdfbrand: marchio vero, filo
// d'oro, piede legale), con TUTTO ciò che rende il conferimento
// verificabile: chi, per quale immobile, a quali condizioni (la foto che la
// firma per mandato ricontrollerà), il testo integrale, quando, da dove, e
// le due impronte (hash del testo, hash delle condizioni).
//
// pdf-lib importato staticamente (la lezione del 22 luglio 2026). Tutto il
// testo passa da wa(): un carattere fuori WinAnsi non degrada, UCCIDE il
// documento.
import { PDFDocument } from 'pdf-lib';
import { brandAssets, masthead, stampFooters, wa, INK, GREY, GOLD, HAIR } from '../_pdfbrand.js';

const W = 595.28, H = 841.89, M = 56;
const TW = W - M * 2;

const itDate = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (_) { return String(iso || '').slice(0, 10); } };
const itDateTime = (iso) => { try { const d = new Date(iso); return itDate(iso) + ' ' + d.toISOString().slice(11, 16) + ' UTC'; } catch (_) { return String(iso || ''); } };
const eur = (n) => { const v = Number(n) || 0; const s = v.toFixed(2).replace('.', ','); return '€ ' + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
const cadenceIt = (n) => ({ 1: 'mensile', 2: 'bimestrale', 3: 'trimestrale', 6: 'semestrale', 12: 'annuale' })[Number(n) || 1] || 'mensile';
const modelIt = (t) => {
  const s = String(t || '').toLowerCase();
  if (s === 'studenti') return 'Allegato C - contratto per studenti universitari (accordo territoriale di Roma)';
  if (s === '3+2' || s === '32' || s === 'concordato') return 'Allegato A - contratto 3+2 a canone concordato (accordo territoriale di Roma)';
  return 'Allegato B - contratto transitorio (accordo territoriale di Roma)';
};

/**
 * @param {object} o  { contract, contractId, property, mandate, landlordName, text }
 * @returns {Promise<Buffer>} un PDF di una (o due) pagine
 */
export async function buildLandlordMandatePdf({ contract, contractId, property, mandate, landlordName, text }) {
  const c = contract || {}, p = property || {}, m = mandate || {};
  const pdf = await PDFDocument.create();
  const b = await brandAssets(pdf);
  const title = 'Mandato a firmare - locatore';
  let page = pdf.addPage([W, H]);
  let y = masthead(page, b, { W, H, M, title, date: itDate(m.at || new Date().toISOString()) });

  const need = (h) => {
    if (y - h < 80) { page = pdf.addPage([W, H]); y = masthead(page, b, { W, H, M, title, date: itDate(m.at || new Date().toISOString()) }); }
  };
  const line = (t, size = 9.5, font = b.font, color = INK, dy = size + 4) => {
    need(dy);
    page.drawText(wa(t), { x: M, y, size, font, color });
    y -= dy;
  };
  const para = (t, size = 9.5, font = b.font, color = INK, lh = size * 1.45) => {
    const words = wa(t).split(/\s+/).filter(Boolean);
    let cur = '';
    const flush = () => { if (!cur) return; need(lh); page.drawText(cur, { x: M, y, size, font, color }); y -= lh; cur = ''; };
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) > TW) { flush(); cur = w; } else cur = test;
    }
    flush();
  };
  const rule = () => { need(10); page.drawRectangle({ x: M, y: y + 3, width: TW, height: 0.6, color: HAIR }); y -= 8; };
  const kv = (k, v) => {
    need(14);
    page.drawText(wa(k), { x: M, y, size: 8.5, font: b.font, color: GREY });
    page.drawText(wa(String(v == null || v === '' ? '-' : v)), { x: M + 150, y, size: 9.5, font: b.font, color: INK });
    y -= 14;
  };

  line('MANDATO A FIRMARE IL CONTRATTO DI LOCAZIONE', 13, b.bold, INK, 22);
  line('Mandato con rappresentanza (art. 1703 ss. c.c.) conferito dal locatore a Egidi Immobiliare S.r.l. (BOOM)', 8.5, b.font, GREY, 16);
  rule();

  line('IL LOCATORE (mandante)', 8, b.bold, GOLD, 13);
  kv('Nome', landlordName || c.landlordName || '-');
  if (c.landlordCF) kv('Codice fiscale', c.landlordCF);
  if (c.landlordEmail) kv('Email', c.landlordEmail);
  y -= 4;

  line('L\'IMMOBILE', 8, b.bold, GOLD, 13);
  kv('Immobile', p.name || '-');
  kv('Indirizzo', [p.address, p.city].filter(Boolean).join(', ') || (c.propertyAddress || '-'));
  y -= 4;

  line('LE CONDIZIONI COPERTE DAL MANDATO', 8, b.bold, GOLD, 13);
  // I nomi si stampano come stanno sul CONTRATTO: la foto delle condizioni
  // (m.terms) li porta normalizzati (minuscolo, senza accenti) perché serve
  // all'impronta, non alla lettura.
  const t = m.terms || {};
  const coNames = (Array.isArray(c.coTenants) ? c.coTenants : []).map(x => (x && x.name) || '').filter(Boolean);
  const tenants = [c.tenantName].concat(coNames).filter(Boolean);
  const shown = tenants.length ? tenants : (Array.isArray(t.tenants) ? t.tenants.map(x => (x && (x.name || x)) || '').filter(Boolean) : []);
  kv(shown.length > 1 ? 'Conduttori' : 'Conduttore', shown.join(' - ') || '-');
  kv('Canone mensile', eur(c.rent));
  kv('Deposito cauzionale', eur(c.deposit));
  kv('Decorrenza', c.startDate ? itDate(c.startDate + 'T00:00:00Z') : '-');
  kv('Scadenza', c.endDate ? itDate(c.endDate + 'T00:00:00Z') : '-');
  kv('Rate', cadenceIt(c.installmentMonths));
  kv('Modello', modelIt(c.type));
  kv('Cedolare secca', (((c.cedolareSecca || 'si') !== 'no' && c.cedolareSecca !== false) ? 'si' : 'no'));
  if (Number(c.accessoryCharges) > 0) kv('Oneri accessori', eur(c.accessoryCharges) + ' / mese');
  y -= 4;

  line('IL TESTO DEL MANDATO', 8, b.bold, GOLD, 13);
  para(text || m.text || '', 9.2, b.font, INK, 13.5);
  y -= 6;
  rule();

  line('IL CONFERIMENTO', 8, b.bold, GOLD, 13);
  para(`Conferito digitalmente dal locatore il ${itDateTime(m.at)} dal proprio link personale della Scheda BOOM (boomrome.com/scheda), previa presa visione delle condizioni sopra riportate.`, 8.5, b.font, INK, 12.5);
  kv('Indirizzo IP', m.ip || '-');
  kv('Dispositivo', String(m.ua || '-').slice(0, 70));
  kv('Hash del testo (SHA-256)', String(m.hash || '-'));
  kv('Impronta delle condizioni', String(m.termsHash || '-'));
  kv('Contratto', contractId || '-');
  if (m.ref) kv('Proposta', m.ref);
  y -= 6;
  para('Documento generato automaticamente da BOOM a prova del conferimento. Il mandato vale soltanto per le condizioni sopra riportate: se il contratto dovesse cambiarle, la firma per mandato non viene apposta. Revocabile per iscritto fino alla firma del contratto.', 7.5, b.font, GREY, 11);

  stampFooters(pdf, b, { W, M });
  return Buffer.from(await pdf.save());
}
