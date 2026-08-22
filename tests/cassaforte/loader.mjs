// Loader ESM: reindirizza 'nodemailer' al mock. Senza, sendEmail apre una
// VERA socket SMTP verso Gmail e la suite si pianta ad aspettare la rete.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'nodemailer') {
    return { url: new URL('./nodemailer-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
