// Loader ESM della suite apply: 'nodemailer' → il mock che CATTURA le email
// (tests/notify), i pacchetti pesanti che servono solo all'import → lo stub
// universale di tests/money. Così la suite gira anche senza npm install.
const STUBBED = new Set(['pdf-lib', 'passkit-generator', 'imapflow', 'sharp', 'jspdf', 'stripe']);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'nodemailer') {
    return { url: new URL('../notify/nodemailer-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (STUBBED.has(specifier)) {
    return { url: new URL('../money/anything-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
