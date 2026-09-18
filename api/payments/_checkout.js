// Riaprire la stessa rata riusa il checkout ancora aperto. Se Stripe ha
// già completato il pagamento, aspettiamo il webhook invece di incassare
// di nuovo. Firestore rimane l'unica fonte dello stato contabile "paid".
export async function existingCheckout(stripe, doc, kind, id, totalCents) {
  if (!doc.checkoutSessionId) return { state: 'none' };
  // Anche "resource_missing" è incerto: potrebbe essere una sessione di
  // un diverso account/configurazione. Solo una scadenza provata riapre.
  const session = await stripe.checkout.sessions.retrieve(doc.checkoutSessionId);
  const meta = session.metadata || {};
  const matches = kind === 'inv'
    ? meta.service === 'INVOICE' && meta.invoiceId === id
    : meta.service === 'RENT' && meta.paymentId === id;
  if (!matches) throw new Error('checkout_document_mismatch');
  if (session.status === 'complete' || session.payment_status === 'paid') return { state: 'complete' };
  if (session.status === 'expired') return { state: 'none' };
  if (session.status !== 'open') throw new Error('checkout_status_unknown');
  if (session.amount_total !== totalCents || session.currency !== 'eur' ||
      Math.round(Number(meta.amount) * 100) !== Math.round(Number(doc.amount) * 100)) {
    // Importo corretto dall'operatore: il vecchio importo non resta pagabile.
    await stripe.checkout.sessions.expire(session.id);
    return { state: 'none' };
  }
  if (!session.url) throw new Error('checkout_url_missing');
  return { state: 'open', session };
}
