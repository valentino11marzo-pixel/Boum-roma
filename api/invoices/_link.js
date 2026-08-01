// api/invoices/_link.js
// Il link di pagamento di una fattura — e la pagina pubblica che la mostra.
//
// Stesso schema di `viewings/_lib.manageToken` e di `profile/_scheda`: il
// token è DERIVATO, non memorizzato. Conseguenze pratiche:
//   · ogni fattura già emessa ha già un link valido — nessuna migrazione;
//   · non c'è un campo in più da tenere in sincronia fra Firestore e Stripe;
//   · ruotare HOMIE_SECRET revoca TUTTI i link in un colpo solo.
// Il tipo di documento entra nella derivazione, così un link fattura non può
// essere riusato per nient'altro.

import crypto from 'node:crypto';

export const SITE = process.env.SITE_URL || 'https://www.boomrome.com';

export function payToken(invoiceId) {
  const salt = process.env.HOMIE_SECRET || process.env.CRON_SECRET || 'boom';
  return crypto.createHash('sha256')
    .update(`invoice-pay:${invoiceId}:${salt}`)
    .digest('hex').slice(0, 24);
}

/** Un blob opaco per l'URL: `<id>.<token>` */
export const payRef = (id) => `${id}.${payToken(id)}`;

/** @returns l'id della fattura se il token torna, altrimenti null */
export function parsePayRef(ref) {
  const s = String(ref || '');
  const i = s.lastIndexOf('.');
  if (i <= 0 || i === s.length - 1) return null;
  const id = s.slice(0, i);
  const got = Buffer.from(s.slice(i + 1));
  const want = Buffer.from(payToken(id));
  // Lunghezze diverse → confronto impossibile senza far trapelare nulla dal
  // tempo di risposta: si esce prima.
  if (got.length !== want.length) return null;
  return crypto.timingSafeEqual(got, want) ? id : null;
}

export const payUrl = (id) => `${SITE}/fattura?t=${payRef(id)}`;

/**
 * Cosa la pagina pubblica può vedere. Tutto il resto della fattura resta
 * dentro: il link è un lasciapassare per PAGARE un documento, non per
 * leggere l'anagrafica fiscale dell'emittente o le note interne.
 */
export function publicView(inv, id) {
  if (!inv) return null;
  const b = inv.buyer || {};
  const t = inv.totals || {};
  return {
    id,
    number: inv.number || null,
    docType: inv.docType || 'TD01',
    date: inv.date || null,
    dueDate: inv.dueDate || null,
    status: inv.status || 'issued',
    currency: inv.currency || 'EUR',
    // Il nome del cliente serve a fargli riconoscere il documento; la sua
    // P.IVA e il codice destinatario no.
    buyerName: b.name || [b.firstName, b.lastName].filter(Boolean).join(' ') || '',
    sellerName: (inv.sellerSnapshot || {}).name || 'Egidi Immobiliare S.r.l.',
    lines: (inv.lines || []).map((l) => ({
      description: l.description || '',
      qty: Number(l.qty) || 1,
      unitPrice: Number(l.unitPrice) || 0,
      vatRate: Number(l.vatRate) || 0,
    })),
    taxable: Number(t.taxable) || 0,
    vat: Number(t.vat) || 0,
    stampDuty: Number(t.stampDuty) || 0,
    withholding: Number(t.withholding) || 0,
    total: Number(t.total) || Number(inv.amount) || 0,
    netToPay: Number(t.netToPay) || Number(t.total) || Number(inv.amount) || 0,
    causale: inv.causale || '',
    iban: (inv.payment || {}).iban || '',
    paidDate: inv.paidDate || null,
    receiptUrl: inv.receiptUrl || null,
    payable: isPayable(inv),
  };
}

/**
 * Una fattura è pagabile con carta solo se c'è davvero qualcosa da incassare.
 * Le bozze non hanno numero (quindi non esistono ancora), le note di credito
 * restituiscono denaro invece di chiederlo, e un documento già saldato non
 * deve poter essere pagato una seconda volta da un link vecchio girato per
 * sbaglio in una chat.
 */
export function isPayable(inv) {
  if (!inv) return false;
  if (inv.status === 'paid' || inv.status === 'void') return false;
  if (inv.status === 'draft' || !inv.number) return false;
  if (inv.docType === 'TD04') return false;
  const due = Number((inv.totals || {}).netToPay) || Number(inv.amount) || 0;
  return due > 0;
}

/** Quanto addebitare, in centesimi: il NETTO, mai il lordo con la ritenuta. */
export function amountCents(inv) {
  const t = inv.totals || {};
  const eur = Number(t.netToPay) || Number(t.total) || Number(inv.amount) || 0;
  return Math.round(eur * 100);
}
