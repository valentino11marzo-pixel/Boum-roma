// Loader ESM della suite rendiconto: 'nodemailer' → un mock che cattura le
// email E sa fallire (globalThis.__mailHook), per provare che un invio
// fallito non perde il mese. pdf-lib resta REALE.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'nodemailer') {
    return { url: new URL('./nodemailer-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
