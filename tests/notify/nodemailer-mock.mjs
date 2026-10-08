// Mock nodemailer: cattura ogni sendMail in globalThis.__mails così i test
// possono asserire destinatario, oggetto e contenuto delle email reali.
const transport = {
  sendMail: async (opts) => {
    const failure = globalThis.__mailFailure;
    if (failure) {
      globalThis.__mailFailure = null;
      if (failure === 'rejected') {
        const e = new Error('SMTP rejected recipient'); e.responseCode = 451; throw e;
      }
      if (failure === 'ambiguous') {
        (globalThis.__mails = globalThis.__mails || []).push(opts); // SMTP may have accepted DATA
        throw new Error('network vanished after DATA');
      }
      if (failure === 'no_acceptance') {
        return { messageId: 'unverified', accepted: [], rejected: [] };
      }
    }
    (globalThis.__mails = globalThis.__mails || []).push(opts);
    return { messageId: 'test-' + (globalThis.__mails.length), accepted: [opts.to], rejected: [] };
  },
};
export default { createTransport: () => transport };
