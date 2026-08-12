// api/payments/_token.js — il link di pagamento che puoi mandare su WhatsApp.
//
// Problema: una Stripe Checkout Session scade (30 minuti, per scelta, in
// api/payments/pay.js). Un link che scade non si può mandare a un inquilino
// — lo apre due ore dopo e trova una pagina morta.
//
// Soluzione: il link NON è la sessione Stripe. È un URL stabile di BOOM che,
// ogni volta che viene aperto, crea una sessione FRESCA e ci reindirizza
// dentro. Non scade mai, non va salvato da nessuna parte (il token è
// DERIVATO dall'id del documento + un segreto server), e ruotando il
// segreto si revocano tutti i link in circolazione.
//
// Stesso schema del `manageToken` delle visite: derivato, non memorizzato,
// quindi ogni pagamento già esistente ha da subito un link valido senza
// alcuna migrazione.

import crypto from 'node:crypto';

const KINDS = { pay: 'payments', inv: 'invoices' };

function salt() {
  return process.env.HOMIE_SECRET || process.env.CRON_SECRET || process.env.STRIPE_WEBHOOK_SECRET || 'boom';
}

/** Token opaco per (tipo, id). 24 hex = 96 bit: non indovinabile. */
export function payToken(kind, id) {
  return crypto.createHash('sha256')
    .update(`boom-pay-link:${kind}:${id}:${salt()}`)
    .digest('hex').slice(0, 24);
}

/** Confronto a tempo costante — niente oracoli sul token. */
export function verifyPayToken(kind, id, token) {
  const want = Buffer.from(payToken(kind, id));
  const got = Buffer.from(String(token || ''));
  if (want.length !== got.length) return false;
  try { return crypto.timingSafeEqual(want, got); } catch (_) { return false; }
}

export function collectionFor(kind) {
  return KINDS[kind] || null;
}

/** L'URL da mandare al cliente. */
export function payLink(kind, id, origin) {
  const base = origin || 'https://www.boomrome.com';
  return `${base}/api/payments/link?k=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}&t=${payToken(kind, id)}`;
}
