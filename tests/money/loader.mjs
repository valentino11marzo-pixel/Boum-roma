// Loader ESM: reindirizza l'import di 'stripe' al mock locale.
// Attivato da tests/money/run.mjs via module.register().
// 'jspdf' è stubbato QUI perché questa suite gira in CI SENZA npm install
// (a zero dipendenze, da sempre): il PDF contratto ha la sua suite dedicata
// (tests/contractpdf, loader proprio con jspdf VERO) — qui la generazione
// fallisce in modo pulito e convert prosegue, che è esattamente il
// comportamento best-effort di produzione a Storage/PDF indisponibile.
const STUBBED = new Set(['pdf-lib', 'nodemailer', 'passkit-generator', 'imapflow', 'sharp', 'jspdf']);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'stripe') {
    return { url: new URL('./stripe-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (STUBBED.has(specifier)) {
    return { url: new URL('./anything-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
