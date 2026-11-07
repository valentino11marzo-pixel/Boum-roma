// api/payments/_token.js — il link di pagamento che puoi mandare su WhatsApp.
//
// Problema: una Stripe Checkout Session scade (30 minuti, per scelta, in
// api/payments/pay.js). Un link che scade non si può mandare a un inquilino
// — lo apre due ore dopo e trova una pagina morta.
//
// Soluzione: il link NON è la sessione Stripe. È un URL stabile di BOOM che,
// ogni volta che viene aperto, riusa il checkout aperto o ne crea uno se
// scaduto. Non scade mai, non va salvato da nessuna parte (il token è
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

// ── Il biglietto dell'ordine di un desk che incassa alla firma (v1.8) ──────
// L'email d'ordine di Parigi e Berlino (gli ordini presi alla firma, fino al
// 6/11/2026) porta «Manage your order»:
// /<desk>?order=<book_…>&t=<token> → GET /api/city-lead?order= (lo stato
// del biglietto: BOOKED, DUE col link di pagamento, PAID, CLOSED). Stesso
// schema del payToken: DERIVATO dall'id + il segreto server, mai salvato,
// confronto a tempo costante; ruotando HOMIE_SECRET si revocano tutti i
// link di gestione. NON è un tipo di KINDS: /api/payments/link?k=ord resta
// rifiutato (un biglietto d'ordine non apre mai una cassa).
/** Token opaco del biglietto d'ordine. 24 hex = 96 bit. */
export function orderToken(id) {
  return crypto.createHash('sha256')
    .update(`boom-city-order:${id}:${salt()}`)
    .digest('hex').slice(0, 24);
}

/** Confronto a tempo costante, come verifyPayToken. */
export function verifyOrderToken(id, token) {
  const want = Buffer.from(orderToken(id));
  const got = Buffer.from(String(token || ''));
  if (want.length !== got.length) return false;
  try { return crypto.timingSafeEqual(want, got); } catch (_) { return false; }
}

// ── Il credito di upgrade di un desk (06/11/2026) ──────────────────────────
// Chi ha pagato l'Application Pack su un desk che incassa alla cassa può
// passare al Full Search entro 30 giorni col prezzo già pagato accreditato
// (api/_upgrade.js decide importo, validità e uso unico). Il link personale è
// /upgrade?l=<svc_…>&t=<token>: stesso schema degli altri, DERIVATO dall'id +
// il segreto server, mai salvato, confronto a tempo costante; ruotando
// HOMIE_SECRET si revocano tutti. NON è un tipo di KINDS: /api/payments/link
// non apre mai una cassa con questo token.
/** Token opaco del link di upgrade. 24 hex = 96 bit. */
export function upgradeToken(id) {
  return crypto.createHash('sha256')
    .update(`boom-city-upgrade:${id}:${salt()}`)
    .digest('hex').slice(0, 24);
}

/** Confronto a tempo costante, come verifyPayToken. */
export function verifyUpgradeToken(id, token) {
  const want = Buffer.from(upgradeToken(id));
  const got = Buffer.from(String(token || ''));
  if (want.length !== got.length) return false;
  try { return crypto.timingSafeEqual(want, got); } catch (_) { return false; }
}

/** L'URL personale dell'upgrade (la pagina /upgrade lo legge e apre la cassa). */
export function upgradeLink(id, origin) {
  const base = origin || 'https://www.boomrome.com';
  return `${base}/upgrade?l=${encodeURIComponent(id)}&t=${upgradeToken(id)}`;
}
