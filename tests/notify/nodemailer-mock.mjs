// Mock nodemailer: cattura ogni sendMail in globalThis.__mails così i test
// possono asserire destinatario, oggetto e contenuto delle email reali.
// globalThis.__mailFail(opts) → un Error da lanciare (o null): simula il
// server SMTP che rifiuta (responseCode 5xx) o una socket caduta a metà.
const transport = {
  sendMail: async (opts) => {
    const fail = typeof globalThis.__mailFail === 'function' ? globalThis.__mailFail(opts) : null;
    if (fail) { (globalThis.__mailAttempts = globalThis.__mailAttempts || []).push({ ...opts, failed: true }); throw fail; }
    (globalThis.__mailAttempts = globalThis.__mailAttempts || []).push(opts);
    (globalThis.__mails = globalThis.__mails || []).push(opts);
    return { messageId: 'test-' + (globalThis.__mails.length) };
  },
};
export default { createTransport: () => transport };
