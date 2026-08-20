// Mock nodemailer con l'interruttore del guasto: __mailFail=true simula
// l'SMTP giù (il ramo che DEVE avvisare su Telegram), altrimenti cattura
// la mail in globalThis.__mails per asserire l'allegato vero.
const transport = {
  sendMail: async (opts) => {
    if (globalThis.__mailFail) throw new Error('smtp giù (finto)');
    (globalThis.__mails = globalThis.__mails || []).push(opts);
    return { messageId: 'test-' + (globalThis.__mails.length) };
  },
};
export default { createTransport: () => transport };
