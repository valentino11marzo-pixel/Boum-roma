// api/rent/_receipt.js
// Quietanza di pagamento — the branded PDF receipt generated the moment a
// rent payment is confirmed by the Stripe webhook. Same visual system as
// the FES signing certificate (api/sign/_finalize.js). pdf-lib is imported
// lazily so a load failure only skips the PDF — the payment still gets
// marked paid.

import crypto from 'node:crypto';
import { getAdminToken } from '../homie/_lib.js';
import { monthLabel, money } from './_lib.js';

const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'boom-property-dashboards.firebasestorage.app';

export async function uploadReceipt(path, bytes) {
  const token = await getAdminToken();
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
    body: bytes,
  });
  if (!r.ok) throw new Error('storage_' + r.status + ': ' + (await r.text()).slice(0, 200));
  const meta = await r.json().catch(() => ({}));
  const dt = (meta.downloadTokens || '').split(',')[0];
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media${dt ? ('&token=' + dt) : ''}`;
}

// payment: the payments doc (already marked paid)
// ctx: output of paymentContext() — contract, property, names
// stripeRef: Stripe session id (traceability reference on the receipt)
export async function buildReceiptPdf(payment, ctx, stripeRef) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.05, 0.05, 0.06), gold = rgb(0.72, 0.55, 0.05), grey = rgb(0.42, 0.42, 0.45);
  const T = (t, x, y, sz, f, col) => page.drawText(String(t == null ? '' : t), { x, y, size: sz, font: f || font, color: col || dark });

  page.drawRectangle({ x: 0, y: 792, width: 595, height: 50, color: dark });
  T('BOOM', 40, 810, 18, bold, rgb(1, 1, 1));
  T('ROMA', 96, 812, 10, font, rgb(0.91, 0.78, 0.41));
  T('Quietanza di pagamento', 380, 818, 9, font, rgb(0.8, 0.8, 0.8));
  T('Rent payment receipt', 380, 805, 9, font, rgb(0.8, 0.8, 0.8));

  let y = 750;
  T('QUIETANZA DI PAGAMENTO — CANONE DI LOCAZIONE', 40, y, 13, bold, gold);
  page.drawLine({ start: { x: 40, y: y - 8 }, end: { x: 555, y: y - 8 }, thickness: 1, color: gold });
  y -= 34;

  const paidAt = payment.paidDate || payment.paidAt || new Date().toISOString();
  const row = (label, val) => { T(label, 40, y, 9, bold, grey); T(val, 200, y, 10, font, dark); y -= 20; };
  row('Ricevuta n.', payment.id || '');
  row('Periodo / Period', `${monthLabel(payment.month, 'it')}  ·  ${monthLabel(payment.month)}`);
  row('Immobile / Property', String(ctx.propLabel || '').slice(0, 70));
  row('Conduttore / Tenant', ctx.tenantName || '—');
  row('Locatore / Landlord', ctx.landlordName || '—');
  row('Scadenza / Due date', payment.dueDate || '—');
  row('Data pagamento / Paid on', new Date(paidAt).toLocaleString('it-IT'));
  row('Metodo / Method', payment.paidVia === 'manual' ? 'Registrato manualmente' : 'Carta — Stripe (pagamento tracciabile)');
  if (stripeRef) row('Riferimento / Reference', String(stripeRef).slice(0, 60));

  y -= 6;
  page.drawRectangle({ x: 40, y: y - 64, width: 515, height: 60, borderColor: gold, borderWidth: 1, color: rgb(0.99, 0.98, 0.95) });
  T('IMPORTO INCASSATO / AMOUNT RECEIVED', 56, y - 22, 8, bold, grey);
  T(money(payment.amount), 56, y - 48, 22, bold, dark);
  T('EUR', 56 + 12 * String(money(payment.amount)).length, y - 48, 10, font, grey);

  const hash = crypto.createHash('sha256')
    .update([payment.id, payment.month, payment.amount, paidAt, stripeRef || ''].join('|'), 'utf8')
    .digest('hex');
  page.drawLine({ start: { x: 40, y: 120 }, end: { x: 555, y: 120 }, thickness: 0.5, color: grey });
  T('Il locatore dichiara di aver ricevuto la somma sopra indicata a titolo di canone di locazione per il periodo indicato.', 40, 104, 8, font, grey);
  T('Pagamento effettuato con mezzo tracciabile. / Payment made by traceable means.', 40, 92, 8, font, grey);
  T('Verifica integrità (SHA-256): ' + hash, 40, 76, 7, font, grey);
  T('BOOM Rome · boomrome.com · generata automaticamente il ' + new Date().toLocaleString('it-IT'), 40, 56, 8, font, grey);

  return await pdf.save();
}
