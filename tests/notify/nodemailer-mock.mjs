// Mock nodemailer: cattura ogni sendMail in globalThis.__mails così i test
// possono asserire destinatario, oggetto e contenuto delle email reali.
const transport = {
  sendMail: async (opts) => {
    (globalThis.__mails = globalThis.__mails || []).push(opts);
    return { messageId: 'test-' + (globalThis.__mails.length) };
  },
};
export default { createTransport: () => transport };
