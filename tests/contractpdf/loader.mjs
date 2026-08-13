// Loader ESM della suite contractpdf: come quello di money (stripe +
// pacchetti pesanti → mock) ma SENZA lo stub di 'jspdf' — qui il PDF si
// impagina per davvero, è l'oggetto del test. Se jspdf non è installato la
// suite si auto-skippa (guardia in run.mjs), mai un falso rosso.
const STUBBED = new Set(['pdf-lib', 'nodemailer', 'passkit-generator', 'imapflow', 'sharp']);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'stripe') {
    return { url: new URL('../money/stripe-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (STUBBED.has(specifier)) {
    return { url: new URL('../money/anything-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
