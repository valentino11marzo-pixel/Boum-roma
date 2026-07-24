// Loader ESM: reindirizza l'import di 'stripe' al mock locale.
// Attivato da tests/money/run.mjs via module.register().
const STUBBED = new Set(['pdf-lib', 'nodemailer', 'passkit-generator', 'imapflow', 'sharp']);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'stripe') {
    return { url: new URL('./stripe-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (STUBBED.has(specifier)) {
    return { url: new URL('./anything-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
