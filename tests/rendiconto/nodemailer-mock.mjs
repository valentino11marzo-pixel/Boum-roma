// Mock nodemailer: ogni sendMail riuscito finisce in globalThis.__mails.
// globalThis.__mailHook(opts) può lanciare (guasto certo) o non tornare mai
// (esito incerto): l'email allora NON viene registrata come consegnata.
const transport = {
  sendMail: async (opts) => {
    if (typeof globalThis.__mailHook === 'function') await globalThis.__mailHook(opts);
    (globalThis.__mails = globalThis.__mails || []).push(opts);
    return { messageId: 'test-' + (globalThis.__mails.length) };
  },
};
export default { createTransport: () => transport };
