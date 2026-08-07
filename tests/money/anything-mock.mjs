// Stub universale per pacchetti pesanti non rilevanti nei test (pdf-lib,
// nodemailer, passkit-generator): un Proxy che sopravvive a qualsiasi uso.
// Le funzioni che li usano sono già avvolte in try/catch nei percorsi reali.
const anything = new Proxy(function () {}, {
  get: (t, prop) => {
    if (prop === Symbol.toPrimitive) return () => '';
    if (prop === 'then') return undefined; // niente thenable: await risolve subito
    return anything;
  },
  apply: () => anything,
  construct: () => anything,
});
export default anything;
export const PDFDocument = anything;
export const StandardFonts = anything;
export const rgb = anything;
export const degrees = anything;
export const PKPass = anything;
export const createTransport = () => ({ sendMail: async () => ({ messageId: 'stub' }) });
