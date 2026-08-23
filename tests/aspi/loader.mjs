// Loader ESM della suite ASPI: nodemailer → mock che cattura le email
// (lo stesso della suite notify). pdf-lib resta REALE: il Fascicolo
// Fiscale che parte in allegato viene costruito davvero.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'nodemailer') {
    return { url: new URL('../notify/nodemailer-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
