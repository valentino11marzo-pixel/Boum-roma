// Loader ESM per la suite SDD: 'stripe' → mock locale (PaymentIntent,
// customers, setupIntents, detach); i pacchetti pesanti non rilevanti
// (nodemailer, pdf-lib, …) → lo stub universale della suite money.
const STUBBED = new Set(['pdf-lib', 'nodemailer', 'passkit-generator', 'imapflow', 'sharp']);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'stripe') {
    return { url: new URL('./stripe-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (STUBBED.has(specifier)) {
    return { url: new URL('../money/anything-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
