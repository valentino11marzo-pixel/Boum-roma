// Loader ESM della suite pratica: nodemailer → mock. L'endpoint non manda
// email, ma importa storageUpload da api/agent/_lib.js, che è il modulo dove
// vive anche sendEmail: senza questo, il test non riesce nemmeno a caricare
// il handler e misurerebbe l'assenza di node_modules invece del codice.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'nodemailer') {
    return { url: new URL('../notify/nodemailer-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
