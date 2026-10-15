// Accepted Checkout amounts are recorded once, in cents. New choices use
// _addons' server catalog; retries use the prices already accepted, never a
// fresh catalog lookup or a differently rounded total.
const invalid = () => { throw new Error('invalid_payment_terms'); };
const cents = value => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return invalid();
  const out = Math.round((n + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(out)) return invalid();
  return out;
};
const text = (value, length = 200) => String(value ?? '').trim().slice(0, length);

export function paymentTermsFor(pa) {
  const saved = pa.paymentTerms;
  const terms = saved ? {
    version: saved.version, currency: saved.currency,
    baseCents: saved.baseCents, totalCents: saved.totalCents,
    addons: Array.isArray(saved.addons) ? saved.addons.map(a => ({ ...a })) : null,
  } : {
    version: 1, currency: 'eur', baseCents: cents(pa.money?.dueAtSigning),
    addons: (pa.addons || []).map(a => ({ kind: text(a.kind, 60), label: text(a.label), amountCents: cents(a.eur) })),
  };
  if (terms.version !== 1 || terms.currency !== 'eur' || !Array.isArray(terms.addons) || terms.addons.length > 10) return invalid();
  if (!Number.isSafeInteger(terms.baseCents) || terms.baseCents < 0) return invalid();
  // Preserve the existing base-payment bounds, but reject an unsupported
  // amount instead of silently replacing the customer's agreed amount.
  if (terms.baseCents && (terms.baseCents < 5000 || terms.baseCents > 2000000)) return invalid();
  const seen = new Set();
  for (const a of terms.addons) {
    if (!a.kind || !a.label || seen.has(a.kind) || !Number.isSafeInteger(a.amountCents) || a.amountCents <= 0) return invalid();
    seen.add(a.kind);
  }
  const addonsCents = terms.addons.reduce((sum, a) => sum + a.amountCents, 0);
  const total = terms.baseCents + addonsCents;
  if (!Number.isSafeInteger(total) || (saved && terms.totalCents !== total)) return invalid();
  if (!saved && pa.addonsEur != null && cents(pa.addonsEur) !== addonsCents) return invalid();
  return { ...terms, totalCents: total };
}

export function checkoutParams(pa, terms = paymentTermsFor(pa)) {
  const tenant = pa.tenant || {}, token = pa.token;
  const line = (name, amount, description) => ({
    price_data: { currency: terms.currency, product_data: { name, ...(description ? { description } : {}) }, unit_amount: amount }, quantity: 1,
  });
  const line_items = terms.baseCents ? [line(
    `Pre-agreement ${pa.ref || ''} — ${pa.property?.address || 'Rome apartment'}`,
    terms.baseCents, 'Amount due at signing per your BOOM pre-agreement. Deposit terms per the agreement.',
  )] : [];
  for (const a of terms.addons) line_items.push(line(`BOOM ${a.label}`, a.amountCents));
  return {
    mode: 'payment', payment_method_types: ['card'], customer_email: tenant.email || undefined, line_items,
    metadata: {
      service: 'PREAGREEMENT', ref: pa.ref || '', token,
      address: text(pa.property?.address), name: tenant.fullName || '', email: tenant.email || '', phone: tenant.phone || '',
      addons: terms.addons.map(a => a.kind).join(',').slice(0, 200),
      addonsEur: String(terms.addons.reduce((sum, a) => sum + a.amountCents, 0) / 100),
    },
    success_url: 'https://www.boomrome.com/pre-agreement?t=' + token + '&paid=1',
    cancel_url: 'https://www.boomrome.com/pre-agreement?t=' + token,
  };
}
