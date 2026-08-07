// Loader ESM: reindirizza 'nodemailer' al mock che cattura le email.
// pdf-lib resta REALE (il certificato FES viene costruito davvero).
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'nodemailer') {
    return { url: new URL('./nodemailer-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
