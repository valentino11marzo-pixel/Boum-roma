// nodemailer finto: ogni email finisce in globalThis.__rataMails, nessuna parte.
const transport = { sendMail: async (m) => { (globalThis.__rataMails ||= []).push(m); return { messageId: 'mail-' + globalThis.__rataMails.length }; } };
export default { createTransport: () => transport };
export const createTransport = () => transport;
